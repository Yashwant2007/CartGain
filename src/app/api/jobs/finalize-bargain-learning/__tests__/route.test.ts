import { NextRequest, NextResponse } from 'next/server'
import { requireJobAuth } from '@/lib/job-auth'
import { finalizeStaleLearningOutcomes } from '@/lib/bargain/learning/outcomes'

jest.mock('@/lib/job-auth', () => ({ requireJobAuth: jest.fn() }))
jest.mock('@/lib/bargain/learning/outcomes', () => ({
  finalizeStaleLearningOutcomes: jest.fn(),
}))

import { GET, POST } from '../route'

const authMock = requireJobAuth as jest.Mock
const finalizeMock = finalizeStaleLearningOutcomes as jest.Mock

function request() {
  return new NextRequest('https://cart-gain.com/api/jobs/finalize-bargain-learning')
}

describe('/api/jobs/finalize-bargain-learning', () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    authMock.mockResolvedValue(null)
    finalizeMock.mockResolvedValue({ scanned: 5, finalized: 2 })
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  test('rejects an unauthorized caller without finalizing', async () => {
    authMock.mockResolvedValue(NextResponse.json({ message: 'Unauthorized' }, { status: 401 }))

    const res = await POST(request())

    expect(res.status).toBe(401)
    expect(finalizeMock).not.toHaveBeenCalled()
  })

  test('GET finalizes stale outcomes and reports the counts', async () => {
    const res = await GET(request())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', scanned: 5, finalized: 2 })
    expect(finalizeMock).toHaveBeenCalledTimes(1)
  })

  test('returns a safe 500 when the finalize sweep throws', async () => {
    finalizeMock.mockRejectedValue(new Error('database password'))

    const res = await POST(request())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ message: 'Something went wrong' })
    expect(errorSpy).toHaveBeenCalledWith(
      '[BARGAIN_LEARNING_FINALIZE]',
      expect.any(Error),
    )
  })
})
