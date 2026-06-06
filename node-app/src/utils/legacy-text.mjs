const SUSPICIOUS_CHAR_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u0080-\u00ff]/;

export function looksLikeLegacyMojibake(value) {
  return typeof value === 'string' && SUSPICIOUS_CHAR_PATTERN.test(value);
}

export function repairLegacyMojibake(value) {
  if (!looksLikeLegacyMojibake(value)) {
    return value;
  }

  const repaired = decodeMixedUtf16LeMojibake(value);
  if (repaired === value) {
    return value;
  }

  return isRepairImprovement(value, repaired) ? repaired : value;
}

function decodeMixedUtf16LeMojibake(input) {
  let output = '';
  let index = 0;
  let inMojibakeRun = false;

  while (index < input.length) {
    if (index + 1 < input.length) {
      const firstByte = input.charCodeAt(index);
      const secondByte = input.charCodeAt(index + 1);
      const codePoint = firstByte | (secondByte << 8);

      if (isLikelyDecodedChinese(codePoint) && (inMojibakeRun || isSuspiciousByte(firstByte) || isSuspiciousByte(secondByte))) {
        output += String.fromCharCode(codePoint);
        index += 2;
        inMojibakeRun = true;
        continue;
      }
    }

    output += input[index];
    index += 1;
    inMojibakeRun = false;
  }

  return output;
}

function isSuspiciousByte(value) {
  return value < 0x20 || value > 0x7f;
}

function isLikelyDecodedChinese(codePoint) {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff)
  );
}

function isRepairImprovement(original, repaired) {
  const originalSuspicious = countMatches(original, SUSPICIOUS_CHAR_PATTERN);
  const repairedSuspicious = countMatches(repaired, SUSPICIOUS_CHAR_PATTERN);
  const originalHan = countHanCharacters(original);
  const repairedHan = countHanCharacters(repaired);

  return repairedSuspicious < originalSuspicious || repairedHan > originalHan;
}

function countMatches(input, pattern) {
  return [...input].filter((character) => pattern.test(character)).length;
}

function countHanCharacters(input) {
  return [...input].filter((character) => {
    const codePoint = character.codePointAt(0) || 0;
    return codePoint >= 0x4e00 && codePoint <= 0x9fff;
  }).length;
}
