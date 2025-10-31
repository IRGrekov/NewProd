#!/usr/bin/env node
/**
 * daily-commit-bot.js
 * Делает 1 коммит в день: обновляет/создаёт несколько файлов (данные за день, README changelog).
 * Если на сегодня уже был коммит этим ботом — тихо завершается.
 * Работает без внешних API и без сторонних npm-зависимостей.
 */

const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const REPO = process.cwd()
const DATA_DIR = path.join(REPO, "data")
const LOG_DIR = path.join(REPO, "logs")
const DAILY_JSON = path.join(DATA_DIR, "daily.json")
const DAILY_MD = path.join(DATA_DIR, "daily.md")
const README = path.join(REPO, "README.md")

ensureDir(DATA_DIR)
ensureDir(LOG_DIR)

function run(cmd) {
  return execSync(cmd, { cwd: REPO, stdio: "pipe", encoding: "utf8" }).trim()
}
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

// YYYY-MM-DD в локальной зоне (важно для «клеточки» GitHub за текущий день)
function todayKey() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

// небольшой набор «заглушек фактов/цитат» (чтобы не ходить в интернет)
const SNIPPETS = [
  "Tweak UI spacing and layout notes",
  "Refactor utility helpers (non-breaking)",
  "Improve docs and developer notes",
  "Add test placeholder and update metadata",
  "Minor styling adjustments and housekeeping",
]

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function loadDaily() {
  if (!fs.existsSync(DAILY_JSON)) return {}
  try {
    return JSON.parse(fs.readFileSync(DAILY_JSON, "utf8"))
  } catch {
    return {}
  }
}

function saveDaily(obj) {
  fs.writeFileSync(DAILY_JSON, JSON.stringify(obj, null, 2) + "\n", "utf8")
}

function updateDailyFiles() {
  const day = todayKey()
  const daily = loadDaily()

  // если уже есть запись на сегодня — считаем работу выполненной
  if (daily[day]) return { changed: false, day }

  // записываем «снимок» за сегодня
  daily[day] = {
    note: pick(SNIPPETS),
    ts: new Date().toISOString(),
  }
  saveDaily(daily)

  // markdown-журнал
  let md = fs.existsSync(DAILY_MD) ? fs.readFileSync(DAILY_MD, "utf8") : "# Daily log\n\n"
  md += `- ${day}: ${daily[day].note}\n`
  fs.writeFileSync(DAILY_MD, md, "utf8")

  // README — ведём простой changelog (если есть README — обновим; если нет — создадим)
  let readme = fs.existsSync(README)
    ? fs.readFileSync(README, "utf8")
    : `# ${path.basename(REPO)}\n\n`
  if (!readme.includes("## Changelog")) readme += "\n## Changelog\n"
  readme += `- ${day}: maintenance & data refresh\n`
  fs.writeFileSync(README, readme, "utf8")

  return { changed: true, day }
}

function pullRebaseSafe() {
  try {
    run("git pull --rebase --autostash")
  } catch (_) {}
}

function commitAndPush(day) {
  // аккуратное сообщение в стиле Conventional Commits
  const header = `chore(data): daily refresh for ${day}`
  const body = [
    "",
    "- chore(data): update data/daily.json",
    "- docs(log): append data/daily.md",
    "- docs(readme): update changelog",
  ].join("\n")

  run("git add -A")
  try {
    run(`git commit -m "${header.replace(/"/g, '\\"')}" -m "${body.replace(/"/g, '\\"')}"`)
  } catch (e) {
    if (String(e).includes("nothing to commit")) return false
    throw e
  }

  try {
    run("git push")
  } catch (e) {
    // на случай гонки — 1 попытка автосинхронизации
    pullRebaseSafe()
    run("git push")
  }
  return true
}

;(function main() {
  pullRebaseSafe()

  const { changed, day } = updateDailyFiles()
  if (!changed) {
    console.log(`[daily-bot] already updated for ${day}, nothing to do.`)
    return
  }
  const ok = commitAndPush(day)
  console.log(ok ? `[daily-bot] committed & pushed for ${day}` : `[daily-bot] nothing to commit`)
})()
