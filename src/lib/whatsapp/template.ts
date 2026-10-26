// Guards for WhatsApp template parameters.
//
// Meta rejects a template when a positional/named parameter is empty, longer
// than 1024 characters, or contains control characters. More importantly, an
// unescaped `{{` in AI-generated copy can be interpreted as a template
// placeholder and either fail the send or change the approved template shape.
// Sanitising here means a bad copy variant degrades to safe text instead of
// burning the round with an opaque (#132000).

export const WHATSAPP_TEMPLATE_PARAM_MAX = 1024

export class WhatsAppTemplateParamError extends Error {
  code = 'TEMPLATE_PARAM_INVALID' as const
  constructor(message: string) {
    super(message)
    this.name = 'WhatsAppTemplateParamError'
  }
}

export function sanitizeTemplateText(value: unknown, maxLength = WHATSAPP_TEMPLATE_PARAM_MAX): string {
  let text = typeof value === 'string' ? value : value == null ? '' : String(value)
  // Control chars (except newline/tab, which we normalise to spaces) break the
  // Graph payload and can be used to smuggle template syntax.
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  text = text.replace(/[\r\n\t]+/g, ' ')
  text = text.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }')
  text = text.replace(/\s{2,}/g, ' ').trim()
  if (text.length > maxLength) text = text.slice(0, maxLength - 1).trimEnd() + '…'
  return text
}

export function assertTemplateText(name: string, value: unknown, maxLength = WHATSAPP_TEMPLATE_PARAM_MAX): string {
  const text = sanitizeTemplateText(value, maxLength)
  if (!text) throw new WhatsAppTemplateParamError(`WhatsApp template parameter "${name}" is empty`)
  return text
}
