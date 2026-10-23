import { buildAnalyticsFromCsv } from "./src/lib/datasetAnalytics"
import { buildCleaningLines } from "./src/lib/cleaningCatalog"

let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const countries = ["United States", "United States", "United States", "Canada", "India", "Germany", "United Kingdom"]
const statuses = ["Paid", "Pending", "Refunded"]
const channels = ["Web", "Store", "App", "Partner", "Phone", "Email", "Social", "Affiliate"]
let csv = "order_id,order_date,country,status,channel,price,qty,revenue,visits\n"
for (let i = 0; i < 600; i++) {
  const month = 1 + (i % 12)
  const day = 1 + (i % 27)
  const price = Math.round((20 + rnd() * 60 + (rnd() < 0.03 ? 900 : 0)) * 100) / 100
  const qty = 1 + Math.floor(rnd() * 5 + month / 4)
  const visits = Math.round(qty * 3 + rnd() * 4)
  csv += `${1000 + i},2025-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")},${countries[i % 7]},${statuses[i % 3]},${channels[Math.floor(rnd() * 8)]},${price},${qty},${(price * qty).toFixed(2)},${visits}\n`
}

const a = buildAnalyticsFromCsv(csv)
console.log("CHOSEN VISUALS:")
for (const c of a.visual!.choices) console.log(`  [${c.kind}] ${c.title}\n      why: ${c.why}`)
console.log("\nBUSINESS INSIGHTS:")
for (const i of a.visual!.insights) console.log(`  [${i.kind}] ${i.title} (${i.metric})\n      ${i.detail}`)

// Dataset with no dates / geo / categories: numeric only
let csv2 = "a,b,c\n"
for (let i = 0; i < 100; i++) csv2 += `${rnd()},${rnd() * 2},${rnd() * 3}\n`
const b = buildAnalyticsFromCsv(csv2)
console.log("\nNUMERIC-ONLY VISUALS:", b.visual!.choices.map((c) => c.kind).join(", "))

console.log("\nSERVER CLEANING LINES:")
for (const l of buildCleaningLines(
  ["trim_whitespace", "normalise_missing_sentinels", "drop_duplicate_rows", "cast_types", "canonicalized_country_country", "standardized_name", "standardized_category_status", "parsed_currency_price"],
  [
    { tactic: "Structural repair (SOFIDR defensive)", column: "(all)", why: "Sentinel nulls, trim, and shape fixes." },
    { tactic: "Geographic synonym collapse", column: "country", why: "Mapped aliases like US / USA / United States to one label (4 cells changed)." },
    { tactic: "Categorical standardization", column: "status", why: "Trim + title-case + common status synonyms." },
    { tactic: "Imputation with indicators", column: "(missing cells)", why: "Median/mode fill plus __was_missing flags." },
  ]
))
  console.log(`  ${l.process} | ${l.step}\n      WHY: ${l.reason}`)
