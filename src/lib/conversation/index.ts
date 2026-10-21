/**
 * Shared conversational intelligence layer.
 *
 * One voice model, one fact contract, one validator, one generator — used by
 * cart recovery today and available to the bargain engine (and future
 * channels) without copying prompts around.
 */
export * from './voice'
export * from './facts'
export * from './validate'
export * from './variety'
export * from './prompts'
export * from './generate'
export * from './recovery'
