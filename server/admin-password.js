require('dotenv').config();

const readline = require('node:readline/promises');
const bcrypt = require('bcryptjs');
const { database } = require('./db');

function readSecret(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
      terminal.question(prompt).then((value) => {
        terminal.close();
        resolve(value);
      }, reject);
      return;
    }

    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = '';
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (character >= ' ') {
          value += character;
          process.stdout.write('*');
        }
      }
    };
    process.stdin.on('data', onData);
  });
}

async function main() {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (await terminal.question('Administrator email: ')).trim().toLowerCase();
  terminal.close();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');

  const password = await readSecret('New password (minimum 12 characters): ');
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  const confirmation = await readSecret('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords did not match.');

  const passwordHash = await bcrypt.hash(password, 12);
  database.prepare(`
    INSERT INTO admins (email, password_hash) VALUES (?, ?)
    ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash
  `).run(email, passwordHash);
  console.log(`Administrator credentials saved for ${email}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
