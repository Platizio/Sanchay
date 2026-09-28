import { describe, expect, it } from 'vitest';
import { ifscSchema, otpCodeSchema, pincodeSchema, VALIDATION_MESSAGES } from '../src/index.js';
import { issuesOf } from './helpers.js';

describe('ifscSchema', () => {
  it.each([
    ['HDFC0001234', 'HDFC0001234'],
    ['hdfc0abc123', 'HDFC0ABC123'],
    [' SBIN0000001 ', 'SBIN0000001'],
  ])('normalises %j to %j', (input, expected) => {
    expect(ifscSchema.parse(input)).toBe(expected);
  });

  it.each(['HDFC1001234', 'HDFC000123', 'HDF00001234', 'HDFC00012345', ''])(
    'rejects %j',
    (input) => {
      expect(issuesOf(ifscSchema, input)[0]).toMatchObject({
        message: VALIDATION_MESSAGES.IFSC_INVALID,
      });
    },
  );
});

describe('pincodeSchema', () => {
  it.each([
    ['560001', '560001'],
    [' 110011 ', '110011'],
  ])('accepts %j as %j', (input, expected) => {
    expect(pincodeSchema.parse(input)).toBe(expected);
  });

  it.each(['060001', '56000', '5600011', '56O001', ''])('rejects %j', (input) => {
    expect(issuesOf(pincodeSchema, input)[0]).toMatchObject({
      message: VALIDATION_MESSAGES.PINCODE_INVALID,
    });
  });
});

describe('otpCodeSchema', () => {
  it.each([
    ['012345', '012345'],
    [' 987654 ', '987654'],
  ])('accepts %j as %j', (input, expected) => {
    expect(otpCodeSchema.parse(input)).toBe(expected);
  });

  it.each(['12345', '1234567', '12a456', '123 456', ''])('rejects %j', (input) => {
    expect(issuesOf(otpCodeSchema, input)[0]).toMatchObject({
      message: VALIDATION_MESSAGES.OTP_INVALID,
    });
  });
});
