'use client'

import styles from './CartGainAnimatic.module.css'
import { useEffect, useMemo, useRef, useState } from 'react'

export default function CartGainAnimatic() {
  const [currentScene, setCurrentScene] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [counterValue, setCounterValue] = useState(0)
  
  const screenRef = useRef<HTMLDivElement>(null)
  const progressFillRef = useRef<HTMLDivElement>(null)
  const playBtnRef = useRef<HTMLButtonElement>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const elapsedRef = useRef(0)
  const counterDoneRef = useRef(false)
  const counterRef = useRef<HTMLDivElement>(null)
  const dotsContainerRef = useRef<HTMLDivElement>(null)
  const timerLblRef = useRef<HTMLDivElement>(null)

  const scenes = useMemo(() => [
    { id: 's1', label: 'Intro', start: 0, end: 4 },
    { id: 's2', label: '₹89', start: 4, end: 7 },
    { id: 's3', label: '₹156', start: 7, end: 10 },
    { id: 's4', label: 'Quote', start: 10, end: 16 },
    { id: 's5', label: 'Stats', start: 16, end: 20 },
    { id: 's6', label: 'CTA', start: 20, end: 23 },
  ], [])
  const TOTAL = 23

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    const tick = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts
      elapsedRef.current += dt
      const sec = elapsedRef.current / 1000

      if (sec >= TOTAL) {
        elapsedRef.current = TOTAL * 1000
        setIsPlaying(false)
        setTime(TOTAL)
        return
      }

      setTime(Math.floor(sec))

      const newScene = scenes.findIndex(
        (s, i) =>
          sec >= s.start && (i === scenes.length - 1 || sec < scenes[i + 1].start)
      )
      if (newScene !== currentScene && newScene >= 0) {
        setCurrentScene(newScene)
        if (newScene === 4) {
          startCounter()
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isPlaying, currentScene, scenes])

  function startCounter() {
    if (counterDoneRef.current) return
    counterDoneRef.current = true
    const target = 23450
    let v = 0
    const step = () => {
      v = Math.min(v + Math.ceil(target / 60), target)
      setCounterValue(v)
      if (v < target) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  function togglePlay() {
    if (isPlaying) {
      setIsPlaying(false)
    } else {
      if (elapsedRef.current >= TOTAL * 1000) {
        elapsedRef.current = 0
        setCurrentScene(0)
        setTime(0)
        setCounterValue(0)
        counterDoneRef.current = false
      }
      lastTsRef.current = null
      setIsPlaying(true)
    }
  }

  function goToScene(idx: number) {
    elapsedRef.current = scenes[idx].start * 1000
    setCurrentScene(idx)
    setTime(scenes[idx].start)
    setIsPlaying(false)
    lastTsRef.current = null
    counterDoneRef.current = false
    setCounterValue(0)
    if (idx === 4) {
      setTimeout(startCounter, 100)
    }
  }

  const progress = (Math.floor(time) / TOTAL) * 100

  return (
    <div className="w-full bg-black rounded-2xl overflow-hidden border-2 border-cyan-400/50 shadow-2xl shadow-cyan-500/20">
      <div className={styles.wrap}>
        <div className={styles.screen} id="screen" ref={screenRef}>
          {/* Scene 1: Intro */}
          <div className={`${styles.scene} ${currentScene === 0 ? styles.active : ''}`} id="s1">
            <div className={styles.s1Bg}></div>
            <div className={styles.phoneGrid}>
              {[...Array(6)].map((_, i) => (
                <div key={i} className={styles.phone}>
                  <div className={styles.notifDot}></div>
                  <div className={styles.phoneScreen}>
                    <div className={styles.notifBar}>
                      <div className={styles.nbTitle}>CartGain</div>
                      <div className={styles.nbMsg}>Your cart waiting...</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.s1Headline}>
              <h1>Your customers want to buy.</h1>
              <p>They just forgot.</p>
            </div>
          </div>

          {/* Scene 2: SMS Recovery $89 */}
          <div className={`${styles.scene} ${currentScene === 1 ? styles.active : ''}`} id="s2">
            <div className={styles.s2Bg}></div>
            <div className={styles.smsCard}>
              <div className={styles.smsHeader}>
                <div className={styles.smsIcon}>CG</div>
                <div>
                  <div className={styles.smsFrom}>CartGain Recovery</div>
                  <div style={{ fontSize: '9px', color: '#4a7090' }}>Today 2:34 PM</div>
                </div>
              </div>
              <div className={styles.smsBubble}>
                Hey! You left something behind 👋<br />
                <strong>Complete your ₹89.00 order</strong> and get it shipped today.<br />
                <br />→{' '}
                <span style={{ color: '#10B981', textDecoration: 'underline' }}>
                  shop.example.com/cart
                </span>
              </div>
              <div className={styles.smsCta}>TAP TO COMPLETE ORDER</div>
            </div>
            <div className={styles.recoveryCard}>
              <div className={styles.rcAmount}>+₹89</div>
              <div className={styles.rcLabel}>recovered</div>
            </div>
          </div>

          {/* Scene 3: Checkout & $156 */}
          <div className={`${styles.scene} ${currentScene === 2 ? styles.active : ''}`} id="s3">
            <div className={styles.s3Bg}></div>
            <div className={styles.notifToast}>
              <div className={styles.ntTitle}>⏰ CartGain — Urgent</div>
              <div className={styles.ntMsg}>
                Your cart expires in 1 hour. Complete before it&apos;s gone.
              </div>
            </div>
            <div className={styles.checkoutPage}>
              <div className={styles.checkoutHeader}>ORDER SUMMARY</div>
              <div className={styles.checkoutRow}>
                <span>Premium Sneakers</span>
                <span>₹156.00</span>
              </div>
              <div className={styles.checkoutRow}>
                <span>Shipping</span>
                <span>Free</span>
              </div>
              <div className={styles.checkoutTotal}>
                <span>Total</span>
                <span style={{ color: '#10B981' }}>₹156.00</span>
              </div>
              <div className={styles.checkoutBtn}>COMPLETE PURCHASE</div>
            </div>
            <div className={styles.thankyou}>
              <div className={styles.tyCheck}>✓</div>
              <div className={styles.tyText}>Thank You!</div>
            </div>
            <div className={styles.recoveryCard2}>
              <div className={styles.rcAmount}>+₹156</div>
              <div className={styles.rcLabel}>recovered</div>
            </div>
          </div>

          {/* Scene 4: Narrator */}
          <div className={`${styles.scene} ${currentScene === 3 ? styles.active : ''}`} id="s4">
            <div className={styles.s4Bg}></div>
            <div className={styles.narratorFrame}>
              <div className={styles.avatarCircle}>
                <div className={styles.avatarRing}></div>👤
              </div>
              <div className={styles.talkingDots}>
                <div className={styles.td}></div>
                <div className={styles.td}></div>
                <div className={styles.td}></div>
              </div>
              <div className={styles.quoteBox}>
                <div className={styles.quoteText}>
                  &quot;Stop leaving money on the table. Automate your recovery and watch your sales
                  grow.&quot;
                </div>
                <div className={styles.quoteAttr}>— CartGain</div>
              </div>
            </div>
          </div>

          {/* Scene 5: Dashboard */}
          <div className={`${styles.scene} ${currentScene === 4 ? styles.active : ''}`} id="s5">
            <div className={styles.s5Bg}></div>
            <div className={styles.dashboard}>
              <div className={styles.dashHeader}>
                <span>CartGain Dashboard · This Week</span>
                <span className={styles.dashBadge}>LIVE</span>
              </div>
              <div className={styles.metricBig}>
                <div className={styles.metricLabel}>Total Recovered</div>
                <div className={styles.metricValue} ref={counterRef}>
                  ₹{counterValue.toLocaleString()}
                </div>
                <div className={styles.metricSub}>+18.4% vs last week</div>
              </div>
              <div className={styles.miniBars}>
                {[...Array(7)].map((_, i) => (
                  <div key={i} className={styles.bar}></div>
                ))}
              </div>
              <div className={styles.barLabels}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day) => (
                  <div key={day} className={styles.barLbl}>
                    {day}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Scene 6: CTA */}
          <div className={`${styles.scene} ${currentScene === 5 ? styles.active : ''}`} id="s6">
            <div className={styles.s6Bg}></div>
            <div className={styles.endFrame}>
              <div className={styles.logoMark}>C</div>
              <div className={styles.brandName}>
                CartGain<span className={styles.brandTm}>™</span>
              </div>
              <div className={styles.glowLine}></div>
              <div className={styles.tagline}>Recover what you&apos;re losing</div>
              <a href="/signup" className={styles.ctaBtn}>
                Start Free Trial ↗
              </a>
            </div>
          </div>
        </div>

        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }}></div>
        </div>

        <div className={styles.controls}>
          <button className={`${styles.ctrlBtn} ${isPlaying ? styles.active : ''}`} onClick={togglePlay}>
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <div className={styles.sceneDots}>
            {scenes.map((scene, idx) => (
              <div
                key={scene.id}
                className={`${styles.dot} ${currentScene === idx ? styles.active : ''}`}
                onClick={() => goToScene(idx)}
              />
            ))}
          </div>
          <div className={styles.timerLbl}>
            {Math.floor(time)}s
          </div>
        </div>
      </div>
    </div>
  )
}
