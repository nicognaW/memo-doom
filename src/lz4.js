export function compressLz4(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError('LZ4 input must be a Uint8Array');
  const sourceLength = input.length;
  const hashTable = new Int32Array(65536);
  hashTable.fill(-1);
  const output = new Uint8Array(sourceLength + Math.ceil(sourceLength / 255) + 32);
  const matchFindLimit = sourceLength - 12;
  const matchCopyLimit = sourceLength - 5;
  let inputOffset = 0;
  let anchor = 0;
  let outputOffset = 0;

  const read32 = (offset) => (
    input[offset]
    | (input[offset + 1] << 8)
    | (input[offset + 2] << 16)
    | (input[offset + 3] << 24)
  ) >>> 0;
  const hash = (value) => (Math.imul(value, 2654435761) >>> 16) & 0xffff;
  const writeLength = (length) => {
    let remaining = length;
    while (remaining >= 255) {
      output[outputOffset] = 255;
      outputOffset += 1;
      remaining -= 255;
    }
    output[outputOffset] = remaining;
    outputOffset += 1;
  };

  while (inputOffset <= matchFindLimit) {
    const sequence = read32(inputOffset);
    const hashValue = hash(sequence);
    const reference = hashTable[hashValue];
    hashTable[hashValue] = inputOffset;
    const canMatch = reference >= 0
      && inputOffset - reference <= 65535
      && read32(reference) === sequence;
    if (!canMatch) {
      inputOffset += 1;
      continue;
    }

    const tokenOffset = outputOffset;
    outputOffset += 1;
    const literalLength = inputOffset - anchor;
    let token = Math.min(literalLength, 15) << 4;
    if (literalLength >= 15) writeLength(literalLength - 15);
    output.set(input.subarray(anchor, inputOffset), outputOffset);
    outputOffset += literalLength;

    const distance = inputOffset - reference;
    output[outputOffset] = distance & 0xff;
    output[outputOffset + 1] = distance >>> 8;
    outputOffset += 2;

    const matchStart = inputOffset;
    let matchReference = reference;
    inputOffset += 4;
    matchReference += 4;
    while (inputOffset < matchCopyLimit && input[inputOffset] === input[matchReference]) {
      inputOffset += 1;
      matchReference += 1;
    }
    const encodedMatchLength = inputOffset - matchStart - 4;
    token |= Math.min(encodedMatchLength, 15);
    output[tokenOffset] = token;
    if (encodedMatchLength >= 15) writeLength(encodedMatchLength - 15);
    anchor = inputOffset;
  }

  const literalLength = sourceLength - anchor;
  const tokenOffset = outputOffset;
  outputOffset += 1;
  output[tokenOffset] = Math.min(literalLength, 15) << 4;
  if (literalLength >= 15) writeLength(literalLength - 15);
  output.set(input.subarray(anchor), outputOffset);
  outputOffset += literalLength;
  return output.slice(0, outputOffset);
}

export function bytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Base64 input must be a Uint8Array');
  let binary = '';
  const chunkSize = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
