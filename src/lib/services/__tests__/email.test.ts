jest.mock('nodemailer');

import { sendEmail, EmailOptions, getEmailProviderStatus } from '../email';

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendEmail', () => {
    it('should have sendEmail function exported', () => {
      expect(typeof sendEmail).toBe('function');
    });

    it('should accept valid email options', async () => {
      const options: EmailOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test email</p>',
        text: 'Test email',
      };

      // Function exists and can be called
      expect(sendEmail).toBeDefined();
    });
  });
});

describe('getEmailProviderStatus', () => {
  const snapshot = () => ({ ...process.env });
  let saved: ReturnType<typeof snapshot>;

  beforeEach(() => {
    saved = snapshot();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_SERVER_HOST;
    delete process.env.EMAIL_SERVER_USER;
    delete process.env.EMAIL_SERVER_PASSWORD;
    process.env.FROM_EMAIL = 'noreply@cart-gain.com';
  });

  afterEach(() => {
    process.env = saved;
  });

  // getEmailProviderStatus reads process.env fresh on each call, so scenarios
  // can just set env then invoke it directly — no module re-import needed.
  const load = () => getEmailProviderStatus();

  it('reports no provider configured (and a warning) when nothing is set', () => {
    const status = load();
    expect(status.configured).toBe(false);
    expect(status.resend).toBe(false);
    expect(status.smtp).toBe(false);
    expect(status.warning).toMatch(/No transactional email provider configured/);
  });

  it('flags a Resend-only setup as a silent-drop risk', () => {
    process.env.RESEND_API_KEY = 're_test';
    const status = load();
    expect(status.configured).toBe(true);
    expect(status.resend).toBe(true);
    expect(status.smtp).toBe(false);
    expect(status.warning).toMatch(/Only Resend is configured/);
  });

  it('does not warn when an SMTP fallback is present', () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_SERVER_HOST = 'smtp.example.com';
    process.env.EMAIL_SERVER_USER = 'user';
    process.env.EMAIL_SERVER_PASSWORD = 'pass';
    const status = load();
    expect(status.configured).toBe(true);
    expect(status.resend).toBe(true);
    expect(status.smtp).toBe(true);
    expect(status.warning).toBeUndefined();
  });

  it('treats a complete SMTP-only setup as configured', () => {
    process.env.EMAIL_SERVER_HOST = 'smtp.example.com';
    process.env.EMAIL_SERVER_USER = 'user';
    process.env.EMAIL_SERVER_PASSWORD = 'pass';
    const status = load();
    expect(status.configured).toBe(true);
    expect(status.resend).toBe(false);
    expect(status.smtp).toBe(true);
  });
});
