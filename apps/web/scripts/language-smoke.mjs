import assert from 'node:assert/strict';
import {posText, localizedStatus, localizedPaymentMethod} from '../src/lib/pos-i18n.ts';
import {phase8Text} from '../src/lib/phase8-i18n.ts';
import {phase9Text} from '../src/lib/phase9-i18n.ts';

let count = 0;
for (const [name, dictionary] of Object.entries({posText, phase8Text, phase9Text})) {
  const expected = Object.keys(dictionary('en')).sort();
  for (const language of ['en', 'hi', 'hinglish']) {
    const messages = dictionary(language);
    assert.deepEqual(Object.keys(messages).sort(), expected, `${name}: missing ${language} keys`);
    for (const [key, value] of Object.entries(messages)) {
      assert.equal(typeof value, 'string', `${name}.${language}.${key}`);
      assert.ok(value.trim(), `${name}.${language}.${key} is empty`);
      if (language !== 'hi') assert.doesNotMatch(value, /[\u0900-\u097f]/u, `${name}.${language}.${key} leaks Hindi script`);
      count++;
    }
  }
}
for (const language of ['en', 'hinglish']) {
  for (const status of ['PAID','PENDING','PARTIALLY_PAID','CANCELLED','REFUNDED','ACTIVE','TRIAL','GRACE_PERIOD','EXPIRED','SUSPENDED']) {
    assert.doesNotMatch(localizedStatus(language, status), /[\u0900-\u097f]/u);
  }
  for (const method of ['CASH','UPI','CARD','CREDIT','OTHER']) {
    assert.doesNotMatch(localizedPaymentMethod(language, method), /[\u0900-\u097f]/u);
  }
}
assert.equal(localizedPaymentMethod('hi','CASH'), 'नकद');
assert.equal(localizedPaymentMethod('hinglish','CREDIT'), 'Udhaar');
assert.equal(localizedPaymentMethod('en','CUSTOM_METHOD'), 'CUSTOM_METHOD');
console.log(`Language checks passed: ${count} messages, matching keys, no Hindi script in English/Hinglish, and localized payment labels.`);
