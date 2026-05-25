import { cn, formatCurrency, formatNumber, formatDate } from '../utils';

describe('Utils', () => {
  describe('cn', () => {
    it('should merge className strings', () => {
      const result = cn('px-2', 'py-1');
      expect(result).toContain('px-2');
      expect(result).toContain('py-1');
    });
  });

  describe('formatCurrency', () => {
    it('should format number as USD currency', () => {
      const result = formatCurrency(1000);
      expect(result).toContain('$');
      expect(result).toContain('1,000');
    });

    it('should format with custom currency', () => {
      const result = formatCurrency(1000, 'INR');
      expect(result).toBeDefined();
    });

    it('should handle decimal amounts', () => {
      const result = formatCurrency(99.99);
      expect(result).toContain('$');
    });
  });

  describe('formatNumber', () => {
    it('should format millions', () => {
      expect(formatNumber(1500000)).toBe('1.5M');
    });

    it('should format thousands', () => {
      expect(formatNumber(1500)).toBe('1.5K');
    });

    it('should return as string for small numbers', () => {
      expect(formatNumber(500)).toBe('500');
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2024-05-20');
      const result = formatDate(date);
      expect(result).toContain('May');
      expect(result).toContain('2024');
    });
  });
});
