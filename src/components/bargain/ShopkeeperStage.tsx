'use client'

import ShopkeeperAvatar from './ShopkeeperAvatar'
import type { ExpressionState } from '@/lib/bargain/experience/expressions'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'

interface Props {
  personality: ShopkeeperPersonality
  expression: ExpressionState
  name: string
  status: string
  line: string
  motionEnabled?: boolean
}

const STAGE_CSS = `
.cg-stage {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  overflow: hidden;
  flex-shrink: 0;
  border-bottom: 1px solid #eef2f7;
  background:
    radial-gradient(circle at 16% 36%, rgba(99,102,241,0.16), transparent 34%),
    radial-gradient(circle at 78% 8%, rgba(251,191,36,0.12), transparent 28%),
    linear-gradient(135deg, #f8faff 0%, #ffffff 68%);
}
.cg-stage::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.32;
  background-image: radial-gradient(#c7d2fe 0.75px, transparent 0.75px);
  background-size: 15px 15px;
}
.cg-stage-spot {
  position: absolute;
  left: -20px;
  top: 50%;
  width: 158px;
  height: 158px;
  transform: translateY(-50%);
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle, rgba(99,102,241,0.2), transparent 68%);
}
.cg-stage-avatar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cg-stage-avatar::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -7px;
  width: 66px;
  height: 12px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: rgba(79,70,229,0.2);
  filter: blur(3px);
}
.cg-stage-halo {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 1px solid rgba(99,102,241,0.24);
  pointer-events: none;
  animation: cgStageHalo 2.8s ease-in-out infinite;
}
.cg-stage[data-expression="thinking"] .cg-stage-halo,
.cg-stage[data-expression="curious"] .cg-stage-halo {
  border-color: rgba(99,102,241,0.45);
  animation-duration: 1.15s;
}
.cg-stage[data-expression="celebrating"] .cg-stage-halo {
  border-color: rgba(22,163,74,0.4);
  box-shadow: 0 0 0 6px rgba(34,197,94,0.08);
}
.cg-stage[data-expression="disappointed"] .cg-stage-halo,
.cg-stage[data-expression="declining"] .cg-stage-halo,
.cg-stage[data-expression="error"] .cg-stage-halo {
  border-color: rgba(148,163,184,0.35);
}
.cg-stage-copy {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
}
.cg-stage-name {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cg-stage-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 700;
  color: #059669;
}
.cg-stage-status::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 3px rgba(52,211,153,0.16);
}
.cg-stage-bubble {
  position: relative;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  padding: 9px 11px;
  border: 1px solid #e0e7ff;
  border-radius: 4px 14px 14px 14px;
  background: #ffffff;
  color: #334155;
  font-size: 12px;
  line-height: 1.42;
  box-shadow: 0 4px 14px rgba(15,23,42,0.06);
  animation: cgStageSpeak 0.28s ease-out;
}
.cg-stage-bubble::before {
  content: "";
  position: absolute;
  left: -6px;
  top: 10px;
  width: 10px;
  height: 10px;
  transform: rotate(45deg);
  border-left: 1px solid #e0e7ff;
  border-bottom: 1px solid #e0e7ff;
  background: #ffffff;
}
.cg-stage[data-expression="celebrating"] .cg-stage-bubble {
  border-color: #bbf7d0;
  color: #166534;
  background: #f7fef9;
}
.cg-stage[data-expression="celebrating"] .cg-stage-bubble::before {
  border-color: #bbf7d0;
  background: #f7fef9;
}
@keyframes cgStageHalo {
  0%, 100% { transform: scale(0.97); opacity: 0.55; }
  50% { transform: scale(1.04); opacity: 1; }
}
@keyframes cgStageSpeak {
  from { opacity: 0; transform: translateY(4px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (max-width: 380px) {
  .cg-stage { gap: 10px; padding: 10px 12px; }
  .cg-stage-bubble { font-size: 11.5px; padding: 8px 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .cg-stage-halo, .cg-stage-bubble { animation: none !important; }
}
`

export default function ShopkeeperStage({
  personality,
  expression,
  name,
  status,
  line,
  motionEnabled = true,
}: Props) {
  return (
    <div className="cg-stage" data-expression={expression}>
      <style dangerouslySetInnerHTML={{ __html: STAGE_CSS }} />
      <span className="cg-stage-spot" aria-hidden="true" />
      <div className="cg-stage-avatar">
        <span className="cg-stage-halo" aria-hidden="true" />
        <ShopkeeperAvatar
          personality={personality}
          expression={expression}
          size="xl"
          motionEnabled={motionEnabled}
        />
      </div>
      <div className="cg-stage-copy">
        <div className="cg-stage-name">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>{name}</span>
          <span className="cg-stage-status">{status}</span>
        </div>
        <div className="cg-stage-bubble" key={line}>{line}</div>
      </div>
    </div>
  )
}
