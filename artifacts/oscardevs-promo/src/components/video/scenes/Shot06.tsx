import { motion } from 'framer-motion';
const ease = [0.22, 1, 0.36, 1] as const;
export function Shot06() {
 return <motion.section className="film-scene paper-field s6-field" initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }} animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }} exit={{ opacity: 0, transition: { duration: .3 } }} transition={{ duration: .58, ease }}>
  <div className="paper-grain"/><div className="shot-index ink-meta">OSCARDEVS / YOUR NEXT CHAPTER <i>06—06</i></div>
  <motion.div className="end-point" initial={{ scale: 0 }} animate={{ scale: [0, 1.25, 1] }} transition={{ duration: .5, ease }}/>
  <motion.div className="end-lockup" animate={{ opacity: [1, 1, 0] }} transition={{ delay: 3.72, duration: 1.15 }}><motion.h1 initial={{ opacity: 0, scale: .92, filter: 'blur(8px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ delay: .28, duration: .68, ease }}>OscarDevs.com</motion.h1><motion.div className="end-underline" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: .62, duration: .5, ease }}/><motion.p dir="rtl" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.12, duration: .45, ease }}>نحو حضور رقمي أوضح</motion.p></motion.div>
  <motion.div className="end-whisper" initial={{ opacity: 0 }} animate={{ opacity: .58 }} transition={{ delay: 2.2 }}>IDEAS, MADE VISIBLE.</motion.div>
  <motion.div className="end-recede" initial={{ opacity: 0, scale: 1, rotate: 45 }} animate={{ opacity: [0, 1, 1], scale: [1, .9, .5], x: [0, 0, '20vw'], y: [0, 0, '-12vh'], rotate: 45 }} transition={{ delay: 3.75, duration: 1.15, ease }}/>
  <motion.div className="end-ink" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1] }} transition={{ delay: 3.72, duration: 1.15 }}/>
 </motion.section>;
}
