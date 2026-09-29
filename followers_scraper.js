const { chromium } = require('playwright');
const fs = require('fs');

// ================= CONFIG =================
const TARGET_USERNAME = 'your_target_username';
const SESSION_FILE = 'session.json';

const OUTPUT_TXT = 'followers.txt';
const OUTPUT_CSV = 'followers.csv';

const MAX_FOLLOWERS = 2000;

const LOGIN_WAIT_TIME = 30000;
// ==========================================

(async () => {

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
  });

  const context = await browser.newContext({
    storageState: fs.existsSync(SESSION_FILE)
      ? SESSION_FILE
      : undefined,
  });

  const page = await context.newPage();

  let isRunning = true;

  // ===== SAFE EXIT =====
  async function safeExit(reason = 'STOP') {

    if (!isRunning) return;

    isRunning = false;

    console.log(`\n🛑 ${reason}`);

    try {
      await context.storageState({
        path: SESSION_FILE,
      });

      console.log('💾 Session saved');
    } catch {}

    try {
      await browser.close();
    } catch {}

    process.exit();
  }

  process.on('SIGINT', () =>
    safeExit('CTRL+C')
  );

  process.on(
    'uncaughtException',
    async err => {
      console.log(err);
      await safeExit('ERROR');
    }
  );

  process.on(
    'unhandledRejection',
    async err => {
      console.log(err);
      await safeExit('PROMISE ERROR');
    }
  );

  // ===== OPEN IG =====
  console.log('🌐 Membuka Instagram...');

  await page.goto(
    'https://www.instagram.com/',
    {
      waitUntil: 'domcontentloaded',
      timeout: 0,
    }
  );

  // ===== LOGIN MANUAL =====
  console.log(
    `⏳ Login manual dalam ${LOGIN_WAIT_TIME / 1000} detik`
  );

  await page.waitForTimeout(
    LOGIN_WAIT_TIME
  );

  await context.storageState({
    path: SESSION_FILE,
  });

  console.log('💾 Session login tersimpan');

  // ===== OPEN PROFILE =====
  const profileUrl =
    `https://www.instagram.com/${TARGET_USERNAME}/`;

  console.log(`🌐 Membuka ${profileUrl}`);

  await page.goto(profileUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 0,
  });

  await page.waitForTimeout(5000);

  // ===== OPEN FOLLOWERS =====
  console.log(
    '📂 Membuka followers...'
  );

  const followersBtn = page
    .locator('a')
    .filter({ hasText: 'followers' })
    .first();

  await followersBtn.click();

  await page.waitForTimeout(5000);

  console.log(
    '✅ Followers modal terbuka'
  );

  // ===== LOAD EXISTING =====
  const followers = new Set();

  if (fs.existsSync(OUTPUT_TXT)) {

    const existing = fs
      .readFileSync(OUTPUT_TXT, 'utf8')
      .split('\n')
      .map(v => v.trim())
      .filter(Boolean);

    existing.forEach(v =>
      followers.add(v)
    );
  }

  console.log(
    `📂 Existing followers: ${followers.size}`
  );

  let lastCount = 0;
  let stuckCount = 0;

  // ===== MAIN LOOP =====
  while (
    followers.size < MAX_FOLLOWERS &&
    isRunning
  ) {

    // ===== GET USERNAMES =====
    const usernames =
      await page.evaluate(() => {

        const arr = [];

        document
          .querySelectorAll(
            'div[role="dialog"] a[href]'
          )
          .forEach(a => {

            const href =
              a.getAttribute('href');

            if (
              href &&
              /^\/[^/]+\/$/.test(href)
            ) {

              const user =
                href.replace(/\//g, '');

              if (
                user &&
                user !== 'explore' &&
                user !== 'reels'
              ) {
                arr.push(user);
              }
            }

          });

        return [...new Set(arr)];

      });

    let added = 0;

    usernames.forEach(u => {

      if (
        u &&
        u !== TARGET_USERNAME &&
        !followers.has(u)
      ) {

        followers.add(u);
        added++;

      }

    });

    console.log(
      `👥 Total followers: ${followers.size} (+${added})`
    );

    // ===== SAVE =====
    fs.writeFileSync(
      OUTPUT_TXT,
      [...followers].join('\n')
    );

    fs.writeFileSync(
      OUTPUT_CSV,
      'username\n' +
      [...followers].join('\n')
    );

    // ===== STUCK CHECK =====
    if (
      followers.size === lastCount
    ) {

      stuckCount++;

      console.log(
        `⚠️ Stuck ${stuckCount}`
      );

    } else {

      stuckCount = 0;

    }

    if (stuckCount >= 10) {

      console.log(
        '🛑 Scroll mentok'
      );

      break;
    }

    lastCount = followers.size;

    // ===== REAL MOUSE WHEEL SCROLL =====
    const box =
      await page.locator(
        'div[role="dialog"]'
      ).boundingBox();

    if (box) {

      await page.mouse.move(
        box.x + box.width / 2,
        box.y + box.height / 2
      );

      // scroll seperti manusia
      await page.mouse.wheel(
        0,
        2000 + Math.random() * 3000
      );

      console.log('🖱️ Scroll wheel');

    }

    await page.waitForTimeout(
      1500 + Math.random() * 2500
    );

  }

  console.log(
    `✅ Selesai ambil ${followers.size} followers`
  );

  await safeExit('DONE');

})();
