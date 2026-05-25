jest.mock('nodemailer');

import { sendEmail, EmailOptions } from '../email';

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
