'use strict';

const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');
const workshopAdmin = require('../src/routes/workshop_admin');

describe('workshop CRM campaign audience rules', () => {
  after(async () => {
    await workshopAdmin.pool.end();
  });

  it('only prepares a preferred channel when consent and its recipient exist', () => {
    const recipient = workshopAdmin.helpers.campaignRecipient({
      marketing_consent: true,
      preferred_channel: 'whatsapp',
      whatsapp: '01012345678',
      phone: '01098765432',
    });
    assert.deepEqual(recipient, { channel: 'whatsapp', recipient: '01012345678' });
  });

  it('records a reason instead of silently falling back or sending without consent', () => {
    assert.equal(
      workshopAdmin.helpers.campaignRecipient({
        marketing_consent: false,
        preferred_channel: 'sms',
        phone: '01012345678',
      }).reason,
      'لا توجد موافقة تسويقية'
    );
    assert.equal(
      workshopAdmin.helpers.campaignRecipient({
        marketing_consent: true,
        preferred_channel: 'phone',
        phone: '01012345678',
      }).reason,
      'الهاتف يحتاج اتصالًا يدويًا وليس رسالة آلية'
    );
  });

  it('keeps campaign audience filters server-owned and tenant-safe', () => {
    assert.match(workshopAdmin.helpers.campaignAudienceCondition('inactive'), /lifecycle_stage/);
    assert.equal(workshopAdmin.helpers.campaignAudienceCondition('unknown'), 'FALSE');
  });
});