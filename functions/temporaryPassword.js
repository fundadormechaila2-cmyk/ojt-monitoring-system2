const { randomInt } = require("node:crypto");

const PASSWORD_CHARACTERS = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnopqrstuvwxyz",
  number: "23456789",
  special: "!@#$%&*",
};

function randomCharacter(characters) {
  return characters[randomInt(characters.length)];
}

function generateTemporaryPassword() {
  const characters = Object.values(PASSWORD_CHARACTERS).join("");
  const password = Object.values(PASSWORD_CHARACTERS).map(randomCharacter);
  while (password.length < 20) password.push(randomCharacter(characters));
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }
  return password.join("");
}

module.exports = { generateTemporaryPassword };
