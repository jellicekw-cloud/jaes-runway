import ExcelJS from 'exceljs'
import { BUDGET_CATS, CAT_COLOR, bankColor, monthName, type BudgetMonth, type YearMonth } from './budget'
import type { MoneyData } from './money'

// Download Excel: your month laid out like the Clover Brook sheet (income by bank, the budget summary with the pie
// chart, every line under its category with ☑ and paid-from colors), plus a Year sheet with the bar chart.
// Loaded only when you press the button, so it doesn't slow the app down.

const MONEY = '"$"#,##0.00'
const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase()
const fill = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } })
const ORANGE = '#E8562A', NAVY = '#22405F', WHITE = { argb: 'FFFFFFFF' }

/** Draws an on-screen chart (SVG) into a PNG for the spreadsheet. */
async function svgToPng(svg: SVGSVGElement | null, width: number, height: number): Promise<string | null> {
  if (!svg) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height))
  clone.querySelectorAll('title').forEach((t) => t.remove())
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone))
  const img = new Image()
  await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('chart')); img.src = url })
  const c = document.createElement('canvas')
  c.width = width * 2; c.height = height * 2
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height)
  g.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

function band(ws: ExcelJS.Worksheet, row: number, text: string, color = ORANGE, cols = 6) {
  ws.mergeCells(row, 1, row, cols)
  const c = ws.getCell(row, 1)
  c.value = text; c.fill = fill(color); c.font = { bold: true, size: 14, color: WHITE }; c.alignment = { horizontal: 'center' }
}
function header(ws: ExcelJS.Worksheet, row: number, labels: string[]) {
  labels.forEach((l, i) => {
    const c = ws.getCell(row, i + 1)
    c.value = l; c.fill = fill(NAVY); c.font = { bold: true, color: WHITE }; c.alignment = { horizontal: i >= 2 && i <= 4 ? 'right' : 'left' }
  })
}

export async function downloadBudgetExcel({ m, b, year, title, pie, bars }: {
  m: MoneyData; b: BudgetMonth; year: YearMonth[]; title: string; pie: SVGSVGElement | null; bars: SVGSVGElement | null
}): Promise<void> {
  void m
  const wb = new ExcelJS.Workbook()
  wb.creator = "Jae's Runway"
  const ws = wb.addWorksheet(monthName(b.month), { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 5 }, { width: 36 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 44 }]

  let r = 1
  ws.mergeCells(r, 1, r, 6)
  Object.assign(ws.getCell(r, 1), { value: title })
  ws.getCell(r, 1).font = { bold: true, size: 20, color: { argb: argb(ORANGE) } }
  r += 1
  ws.getCell(r, 2).value = `Month: ${monthName(b.month)}`; ws.getCell(r, 2).font = { bold: true }
  ws.getCell(r, 4).value = b.through < b.to && b.started ? `Through ${b.through}` : ''
  r += 2

  // Monthly income, by bank
  band(ws, r++, 'Monthly Income')
  for (const p of b.panels) {
    const col = bankColor(p.label)
    ws.mergeCells(r, 2, r, 4)
    const h = ws.getCell(r, 2)
    h.value = p.label === 'NFCU' ? 'Navy Federal CU' : p.label; h.fill = fill(col.solid); h.font = { bold: true, color: WHITE }
    r++
    const first = r
    for (const row of p.rows) {
      ws.getCell(r, 2).value = row.label
      ws.getCell(r, 3).value = row.tag === 'REAL' ? 'real' : row.tag === 'EXPECTED' ? 'expected' : row.tag === 'USUAL' ? 'usual' : ''
      ws.getCell(r, 3).font = { italic: true, color: { argb: 'FF64748B' } }
      ws.getCell(r, 4).value = row.amount; ws.getCell(r, 4).numFmt = MONEY
      if (row.tag === 'EXPECTED') ws.getCell(r, 4).font = { color: { argb: 'FF94A3B8' } }
      r++
    }
    ws.getCell(r, 2).value = 'Came in so far'; ws.getCell(r, 2).font = { bold: true }
    ws.getCell(r, 4).value = p.rows.length ? { formula: `SUMIFS(D${first}:D${r - 1},C${first}:C${r - 1},"<>expected")`, result: p.total } : p.total
    ws.getCell(r, 4).numFmt = MONEY; ws.getCell(r, 4).font = { bold: true, color: { argb: argb(col.solid) } }
    r += 2
  }

  // Budget summary + pie
  band(ws, r++, 'Monthly Budget')
  header(ws, r++, ['', 'Category', 'Budget', 'Actual', '% of spending', 'Over / under'])
  const sumStart = r
  const catRow = new Map<string, number>()
  for (const c of b.cats) {
    catRow.set(c.cat, r)
    ws.getCell(r, 1).fill = fill(CAT_COLOR[c.cat])
    ws.getCell(r, 2).value = c.cat
    ws.getCell(r, 3).value = c.budget; ws.getCell(r, 3).numFmt = MONEY
    ws.getCell(r, 4).value = c.actual; ws.getCell(r, 4).numFmt = MONEY
    ws.getCell(r, 5).value = { formula: `IF($D$${sumStart + b.cats.length}=0,0,D${r}/$D$${sumStart + b.cats.length})`, result: b.actualTotal ? c.actual / b.actualTotal : 0 }
    ws.getCell(r, 5).numFmt = '0%'
    const diff = c.budget - c.actual
    ws.getCell(r, 6).value = { formula: `C${r}-D${r}`, result: diff }
    ws.getCell(r, 6).numFmt = `${MONEY};[Red]-${MONEY}`
    r++
  }
  ws.getCell(r, 2).value = 'Total'; ws.getCell(r, 2).font = { bold: true }
  for (const [col, v] of [[3, b.budgetTotal], [4, b.actualTotal]] as const) {
    const L = col === 3 ? 'C' : 'D'
    ws.getCell(r, col).value = { formula: `SUM(${L}${sumStart}:${L}${r - 1})`, result: v }
    ws.getCell(r, col).numFmt = MONEY; ws.getCell(r, col).font = { bold: true }
  }
  ws.getCell(r, 6).value = { formula: `C${r}-D${r}`, result: b.budgetTotal - b.actualTotal }; ws.getCell(r, 6).numFmt = `${MONEY};[Red]-${MONEY}`
  const totalRow = r
  r += 2
  for (const [label, v, color] of [['Income', b.incomeTotal, ORANGE], ['Expense total', b.actualTotal, ORANGE], ['Difference', b.difference, '#15803D']] as const) {
    const l = ws.getCell(r, 2); l.value = label; l.fill = fill(color); l.font = { bold: true, color: WHITE }
    const c = ws.getCell(r, 3)
    c.value = label === 'Expense total' ? { formula: `D${totalRow}`, result: v } : label === 'Difference' ? { formula: `C${r - 2}-C${r - 1}`, result: v } : v
    c.numFmt = MONEY; c.font = { bold: true, size: 13 }
    r++
  }
  const piePng = await svgToPng(pie, 220, 220).catch(() => null)
  if (piePng) ws.addImage(wb.addImage({ base64: piePng, extension: 'png' }), { tl: { col: 6.2, row: sumStart - 2 }, ext: { width: 260, height: 260 } })
  r += 1

  // Every line, under its category
  band(ws, r++, 'Details')
  header(ws, r++, ['Paid', 'Line', 'Budget', 'Actual', 'Paid from', 'Comments'])
  for (const c of b.cats) {
    ws.mergeCells(r, 1, r, 2)
    const h = ws.getCell(r, 1)
    h.value = c.cat; h.fill = fill(CAT_COLOR[c.cat]); h.font = { bold: true, color: WHITE }
    const head = r
    r++
    const first = r
    for (const l of c.lines) {
      ws.getCell(r, 1).value = l.auto ? 'auto' : l.dueCount ? (l.open.length ? '☐' : '☑') : ''
      ws.getCell(r, 1).alignment = { horizontal: 'center' }
      ws.getCell(r, 2).value = l.name
      ws.getCell(r, 3).value = l.budget; ws.getCell(r, 3).numFmt = MONEY
      ws.getCell(r, 4).value = l.actual; ws.getCell(r, 4).numFmt = MONEY
      if (l.from) { const ch = bankColor(l.from); const f = ws.getCell(r, 5); f.value = l.from; f.fill = fill(ch.bg); f.font = { bold: true, color: { argb: argb(ch.fg) } } }
      const notes = [l.auto ? 'Auto-pay' : '', l.unmarked ? `$${l.unmarked.toFixed(2)} due, not marked paid` : '', l.nextDue && l.nextDue > b.through ? `Due ${l.nextDue}` : '', l.note ?? '']
      ws.getCell(r, 6).value = notes.filter(Boolean).join(' · ')
      r++
    }
    for (const [col, L] of [[3, 'C'], [4, 'D']] as const) {
      const cell = ws.getCell(head, col)
      cell.value = c.lines.length ? { formula: `SUM(${L}${first}:${L}${r - 1})`, result: col === 3 ? c.budget : c.actual } : 0
      cell.numFmt = MONEY; cell.font = { bold: true, color: WHITE }; cell.fill = fill(CAT_COLOR[c.cat])
    }
    for (const col of [5, 6]) ws.getCell(head, col).fill = fill(CAT_COLOR[c.cat])
  }
  r += 1
  ws.getCell(r, 2).value = 'Colors: purple = NFCU, orange = SoFi. Actual = money that left NFCU or SoFi (card purchases count when you pay the card).'
  ws.getCell(r, 2).font = { italic: true, color: { argb: 'FF64748B' } }

  // The year
  const y = wb.addWorksheet(`${year[0]?.month.slice(0, 4) ?? ''} Year`, { views: [{ showGridLines: false }] })
  y.columns = [{ width: 18 }, ...BUDGET_CATS.map(() => ({ width: 14 })), { width: 14 }, { width: 14 }, { width: 14 }]
  y.mergeCells(1, 1, 1, 8)
  y.getCell(1, 1).value = `${title} · the year`; y.getCell(1, 1).font = { bold: true, size: 18, color: { argb: argb(ORANGE) } }
  const yh = ['Month', 'Income', 'Budget', 'Actual', 'Difference']
  yh.forEach((l, i) => { const c = y.getCell(3, i + 1); c.value = l; c.fill = fill(NAVY); c.font = { bold: true, color: WHITE } })
  let yr = 4
  for (const mo of year) {
    y.getCell(yr, 1).value = monthName(mo.month).split(' ')[0]
    if (mo.b) {
      ;[mo.b.incomeTotal, mo.b.budgetTotal, mo.b.actualTotal].forEach((v, i) => { const c = y.getCell(yr, i + 2); c.value = v; c.numFmt = MONEY })
      y.getCell(yr, 5).value = { formula: `B${yr}-D${yr}`, result: mo.b.difference }; y.getCell(yr, 5).numFmt = `${MONEY};[Red]-${MONEY}`
    } else y.getCell(yr, 2).value = '—'
    yr++
  }
  yr += 1
  const tracked = year.filter((mo) => mo.b)
  const ch = y.getCell(yr, 1); ch.value = 'Category (actual)'; ch.fill = fill(NAVY); ch.font = { bold: true, color: WHITE }
  tracked.forEach((mo, i) => { const c = y.getCell(yr, i + 2); c.value = monthName(mo.month).slice(0, 3); c.fill = fill(NAVY); c.font = { bold: true, color: WHITE } })
  yr++
  for (const cat of BUDGET_CATS) {
    const c = y.getCell(yr, 1); c.value = cat; c.font = { bold: true, color: { argb: argb(CAT_COLOR[cat]) } }
    tracked.forEach((mo, i) => { const v = y.getCell(yr, i + 2); v.value = mo.b!.cats.find((x) => x.cat === cat)!.actual; v.numFmt = MONEY })
    yr++
  }
  const barsPng = await svgToPng(bars, 1200, 210).catch(() => null)
  if (barsPng) y.addImage(wb.addImage({ base64: barsPng, extension: 'png' }), { tl: { col: 6.3, row: 2 }, ext: { width: 720, height: 126 } })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${title.replace(/[^\w ]+/g, '').trim()} - ${monthName(b.month)}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
