import { fetchTrendSignals } from '../wikimedia'

function pageviews(items: { date: string; views: number }[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      items: items.map((item) => ({ timestamp: `${item.date}T00:00:00`, views: item.views })),
    }),
  } as any
}

const NOW = new Date('2026-11-24T12:00:00.000Z')

describe('wikimedia trend adapter', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('computes a bounded direction from 14 days of official page views', async () => {
    const fetchMock = jest.fn().mockResolvedValue(pageviews([
      { date: '20261110', views: 100 },
      { date: '20261111', views: 100 },
      { date: '20261112', views: 100 },
      { date: '20261113', views: 100 },
      { date: '20261114', views: 100 },
      { date: '20261115', views: 100 },
      { date: '20261116', views: 100 },
      { date: '20261117', views: 180 },
      { date: '20261118', views: 180 },
      { date: '20261119', views: 180 },
      { date: '20261120', views: 180 },
      { date: '20261121', views: 180 },
      { date: '20261122', views: 180 },
      { date: '20261123', views: 180 },
    ]))
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock)

    const signals = await fetchTrendSignals(['fitness'], 'US', NOW)
    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({
      topicId: 'fitness',
      source: 'wikimedia_pageviews',
      direction: 'up',
      changePercent: 80,
      recentViews: 1260,
      previousViews: 700,
      windowEnd: '2026-11-23',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('wikimedia.org/api/rest_v1/metrics/pageviews')
  })

  it('marks low-volume topics as insufficient instead of inventing a trend', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(pageviews([
      { date: '20261110', views: 2 },
      { date: '20261117', views: 4 },
    ]))

    const signals = await fetchTrendSignals(['coffee'], 'US', NOW)
    expect(signals[0]).toMatchObject({ direction: 'insufficient', changePercent: null })
  })

  it('drops failed sources without throwing', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as any)
    await expect(fetchTrendSignals(['gaming'], 'US', NOW)).resolves.toEqual([])
  })
})
