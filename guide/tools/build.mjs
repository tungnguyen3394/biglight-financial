/* ============================================================================
   build.mjs — ghép ẢNH CHỤP + LỜI GIẢI THÍCH → PDF A4 và HTML (một file, mở bằng trình duyệt)
   ----------------------------------------------------------------------------
   node tools/build.mjs vi     → pdf/<tên>.pdf + pdf/<tên>.html

   ★ KHÔNG cần máy chủ. Chỉ đọc:
       <bản>/noidung.mjs   lời giải thích (sửa chữ ở đây)
       <bản>/shots/*.jpg   ảnh chụp (tools/capture.mjs tạo)
       <bản>/shots/*.json  vị trí khung cam trên ảnh
   ★ Khung cam nằm ĐÈ lên ảnh (HTML) → đổi số, bỏ khung không phải chụp lại.
   ★ Làm theo CONG-THUC-XAY-DUNG-APP.md §18. Khác bản CRM: ảnh là màn hình MÁY TÍNH
     (khung trình duyệt thay cho khung iPhone), ảnh nằm trên, các bước nằm dưới.
   ============================================================================ */
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUT = path.join(ROOT, 'pdf')

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
/* **đậm**, `nhãn trên màn hình`, xuống dòng bằng \n */
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<span class="ui">$1</span>').replace(/\n/g, '<br>')
const dataUri = (f, t) => `data:${t};base64,` + fs.readFileSync(f).toString('base64')

function loadShot(dir, name) {
  const img = path.join(dir, 'shots', name + '.jpg')
  if (!fs.existsSync(img)) return null
  const js = path.join(dir, 'shots', name + '.json')
  const meta = fs.existsSync(js) ? JSON.parse(fs.readFileSync(js, 'utf8')) : { width: 1440, height: 900, marks: {} }
  return { src: dataUri(img, 'image/jpeg'), ...meta }
}

/* Một ảnh + khung cam. maxH = chiều cao tối đa (mm) — ảnh cao thì thu hẹp lại cho vừa trang. */
function figure(dir, sc, steps, startNo, L, capW = 180) {
  const s = loadShot(dir, sc.shot)
  if (!s) return `<div class="fig missing">${esc(L.missing)}<br><code>${esc(sc.shot)}</code></div>`
  const H = sc.crop ? Math.min(s.height, sc.crop) : s.height
  const pct = (v, t) => (v / t * 100).toFixed(3) + '%'
  let marks = ''
  steps.forEach((st, i) => {
    const b = st.box || (st.mark && s.marks[st.mark])
    if (!b) return
    const pad = st.pad ?? 4
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad)
    const w = Math.min(s.width - x, b.w + pad * 2), h = Math.min(b.h + pad * 2, H - y)
    if (y > H) return
    const right = st.badge ? st.badge === 'right' : w > s.width * 0.5
    const bx = Math.max(1.4, Math.min(98.6, (right ? x + w : x) / s.width * 100))
    const by = Math.max(2.5, y / H * 100)
    marks += `<div class="hl${st.style === 'soft' ? ' soft' : ''}" style="left:${pct(x, s.width)};top:${pct(y, H)};width:${pct(w, s.width)};height:${pct(h, H)}"></div>` +
             `<div class="no" style="left:${bx}%;top:${by}%">${startNo + i}</div>`
  })
  const maxH = sc.maxH || 120                         // mm
  const frameW = Math.min(capW, maxH * s.width / H)   // mm, bề rộng ảnh (2 ảnh cạnh nhau thì chia đôi)
  const modal = !!sc.modal
  return `<figure class="fig ${modal ? 'modal' : 'browser'}" style="width:${frameW.toFixed(1)}mm">
    ${modal ? '' : `<div class="bar"><i></i><i></i><i></i><span>finance.biglight.jp</span></div>`}
    <div class="screen" style="aspect-ratio:${s.width}/${H}">
      <img src="${s.src}" style="height:${(s.height / H * 100).toFixed(3)}%">${marks}
    </div>
    ${sc.caption ? `<figcaption>${rich(sc.caption)}</figcaption>` : ''}
  </figure>`
}

function stepList(steps, startNo, cols) {
  return `<ol class="steps${cols ? ' c2' : ''}">${steps.map((st, i) => `
    <li><span class="n">${startNo + i}</span><div>
      <p class="t">${rich(st.text)}</p>${st.sub ? `<p class="s">${rich(st.sub)}</p>` : ''}
    </div></li>`).join('')}</ol>`
}

function boxes(pg, L) {
  let h = ''
  if (pg.tip) h += `<div class="box tip"><span class="h">${esc(L.tip)}</span><p>${rich(pg.tip)}</p></div>`
  if (pg.note) h += `<div class="box note"><span class="h">${esc(L.note)}</span><p>${rich(pg.note)}</p></div>`
  return h
}

/* Khối chữ cho trang không có ảnh (tổng quan, lịch làm việc, hỏi đáp) */
function blocks(list) {
  return (list || []).map(b => {
    if (b.h) return `<h3>${rich(b.h)}</h3>`
    if (b.p) return `<p class="para">${rich(b.p)}</p>`
    if (b.list) return `<ul class="bul">${b.list.map(x => `<li>${rich(x)}</li>`).join('')}</ul>`
    if (b.table) return `<table class="tbl">${b.head ? `<thead><tr>${b.head.map(x => `<th>${rich(x)}</th>`).join('')}</tr></thead>` : ''}
      <tbody>${b.table.map(r => `<tr>${r.map(x => `<td>${rich(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    if (b.qa) return `<div class="qa">${b.qa.map(([q, a]) => `<div class="q"><b>Hỏi:</b> ${rich(q)}</div><div class="a">${rich(a)}</div>`).join('')}</div>`
    if (b.check) return `<div class="check"><div class="ck-h">${rich(b.check)}</div><ul>${b.items.map(x => `<li><span class="bx"></span><span>${rich(x)}</span></li>`).join('')}</ul></div>`
    if (b.flow) return flowDiagram(b.flow)
    if (b.html) return b.html
    return ''
  }).join('')
}

/* Sơ đồ luồng: các hàng, mỗi hàng là các ô nối bằng mũi tên. {rows:[[{t,s,c}...]], note} */
function flowDiagram(f) {
  const cell = x => `<div class="fb k-${x.c || ''}"><b>${rich(x.t)}</b>${x.s ? `<span>${rich(x.s)}</span>` : ''}</div>`
  return `<div class="flow">${f.title ? `<div class="fl-t">${rich(f.title)}</div>` : ''}${f.rows.map(r =>
    `<div class="fr">${r.map((x, i) => (i ? `<div class="arr">${esc(x.arrow || '→')}</div>` : '') + cell(x)).join('')}</div>`).join('')}
    ${f.note ? `<div class="fl-n">${rich(f.note)}</div>` : ''}</div>`
}

function contentPage(dir, G, ch, chNo, pg, pageNo, L) {
  const screens = pg.screens || []
  let no = 1, figs = '', lists = ''
  const parts = screens.map(sc => { const p = { sc, start: no }; no += (sc.steps || []).length; return p })
  if (screens.length === 1) {
    const st = parts[0].sc.steps || []
    figs = figure(dir, parts[0].sc, st, 1, L)
    lists = stepList(st, 1, st.length > 5 || pg.cols)
  } else if (screens.length > 1) {
    const side = pg.side                              // 2 ảnh nhỏ nằm cạnh nhau
    const capW = side ? (180 - 5 * (parts.length - 1)) / parts.length : 180
    figs = `<div class="${side ? 'side' : 'stack'}">${parts.map(p => figure(dir, p.sc, p.sc.steps || [], p.start, L, capW)).join('')}</div>`
    lists = `<div class="cols">${parts.map(p => `<div>${p.sc.label ? `<div class="sl">${rich(p.sc.label)}</div>` : ''}${stepList(p.sc.steps || [], p.start)}</div>`).join('')}</div>`
  }
  return `<section class="page content">
    <header class="ph"><span class="chip">${chNo}</span><span class="cht">${esc(ch.title)}</span><span class="brand">${esc(G.short)}</span></header>
    <h2>${rich(pg.title)}</h2>
    ${pg.lead ? `<p class="lead">${rich(pg.lead)}</p>` : ''}
    ${figs ? `<div class="figs">${figs}</div>` : ''}
    <div class="text">${lists}${blocks(pg.blocks)}${boxes(pg, L)}</div>
    <footer class="pf"><span>${esc(G.titleLine)}</span><span>${pageNo}</span></footer>
  </section>`
}

function cover(G, logo) {
  return `<section class="page cover">
    <div class="cv-top"><img src="${logo}" class="logo"><span>BIGLIGHT</span></div>
    <div class="cv-mid">
      <p class="kicker">${esc(G.kicker)}</p>
      <h1>${rich(G.title)}</h1>
      <p class="sub">${rich(G.subtitle)}</p>
    </div>
    <div class="cv-bot"><p>${rich(G.audience)}</p><p class="ver">${esc(G.version)}</p></div>
  </section>`
}

function toc(G, pagesOf, L) {
  const rows = G.chapters.map((ch, i) =>
    `<li><span class="chip">${i + 1}</span><span class="tt"><a href="#ch${i + 1}">${esc(ch.title)}</a></span><span class="dots"></span><span class="pg">${pagesOf[i]}</span>
     ${ch.summary ? `<p>${rich(ch.summary)}</p>` : ''}</li>`).join('')
  return `<section class="page toc">
    <h2>${esc(L.toc)}</h2>
    ${G.intro ? `<p class="lead">${rich(G.intro)}</p>` : ''}
    <ol>${rows}</ol>
    <div class="legend">
      <div class="lg"><span class="hl-demo"></span><span class="no-demo">1</span><p>${rich(L.legend)}</p></div>
      <div class="lg"><span class="ui">入金を記録</span><p>${rich(L.legendUi)}</p></div>
    </div>
    <footer class="pf"><span>${esc(G.titleLine)}</span><span>2</span></footer>
  </section>`
}

function backPage(G, pageNo) {
  return `<section class="page back">
    <h2>${rich(G.contact.title)}</h2>
    <div class="contact">${G.contact.lines.map(l => `<p>${rich(l)}</p>`).join('')}</div>
    <footer class="pf"><span>${esc(G.titleLine)}</span><span>${pageNo}</span></footer>
  </section>`
}

async function buildOne(slug, browser) {
  const dir = path.join(ROOT, slug)
  const G = (await import(pathToFileURL(path.join(dir, 'noidung.mjs')).href + '?t=' + Date.now())).default
  const L = G.labels
  const logo = dataUri(path.join(HERE, 'logo.png'), 'image/png')
  let pageNo = 3
  const pagesOf = []
  let body = ''
  G.chapters.forEach((ch, ci) => {
    pagesOf.push(pageNo)
    ch.pages.forEach((pg, pi) => {
      body += (pi === 0 ? `<a id="ch${ci + 1}"></a>` : '') + contentPage(dir, G, ch, ci + 1, pg, pageNo, L); pageNo++
    })
  })
  const html = `<!doctype html><html lang="${G.lang}"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(G.titleLine)}</title><style>${fs.readFileSync(path.join(HERE, 'style.css'), 'utf8')}</style></head>
    <body class="lang-${G.lang}">${cover(G, logo)}${toc(G, pagesOf, L)}${body}${backPage(G, pageNo)}</body></html>`

  fs.mkdirSync(OUT, { recursive: true })
  const base = G.file.replace(/\.pdf$/, '')
  const htmlFile = path.join(OUT, base + '.html')
  fs.writeFileSync(htmlFile, html)
  const page = await browser.newPage()
  await page.goto(pathToFileURL(htmlFile).href)
  await page.evaluate(() => document.fonts.ready)
  /* Trang nào chữ tràn xuống chân trang thì báo — sửa bằng cách rút chữ hoặc giảm maxH của ảnh */
  const over = await page.evaluate(() => [...document.querySelectorAll('.page.content')].map((p, i) => {
    const t = p.querySelector('.text'), f = p.querySelector('.pf')
    const last = t && [...t.querySelectorAll('*')].reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0)
    return last > f.getBoundingClientRect().top - 2 ? (p.querySelector('h2')?.innerText || i) : null
  }).filter(Boolean))
  const pdfFile = path.join(OUT, G.file)
  await page.pdf({ path: pdfFile, format: 'A4', printBackground: true, preferCSSPageSize: true })
  await page.close()
  const missing = (html.match(/class="fig missing"/g) || []).length
  console.log(`✔ ${path.relative(ROOT, pdfFile)}  (${pageNo} trang${missing ? `, ⚠ thiếu ${missing} ảnh` : ''})`)
  console.log(`✔ ${path.relative(ROOT, htmlFile)}`)
  over.forEach(t => console.warn(`  ⚠ chữ tràn xuống chân trang: «${t}»`))
  if (over.length || missing) process.exitCode = 1
}

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ['vi']
const browser = await chromium.launch()
try { for (const s of slugs) await buildOne(s, browser) } finally { await browser.close() }
