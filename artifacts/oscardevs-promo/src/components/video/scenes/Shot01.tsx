import { motion } from 'framer-motion';

const ease = [0.22, 1, 0.36, 1] as const;
export function Shot01() {
  return <motion.section className="film-scene ink-field" initial={{ opacity: 0, clipPath: 'inset(0 0 0 100%)' }} animate={{ opacity: 1, clipPath: 'inset(0 0 0 0%)' }} exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.34 } }} transition={{ duration: 0.55, ease }}>
    <div className="grid-veil" />
    <motion.div className="shot-index" initial={{ opacity: 0 }} animate={{ opacity: 0.68 }} transition={{ delay: 0.2 }}>OSCARDEVS / DIGITAL STUDIO <i>01—06</i></motion.div>
    <motion.div className="cursor-orbit" initial={{ scale: 0.15, rotate: -25 }} animate={{ scale: [0.15, 1.12, 1], rotate: 0 }} transition={{ duration: 0.7, times: [0, 0.72, 1], ease }}>
      <span className="cursor-core"/><span className="orbit orbit-one"/><span className="orbit orbit-two"/><span className="cursor-corner"/>
    </motion.div>
    <div className="s1-copy" dir="rtl">
      <motion.div className="s1-word" initial={{ opacity: 0, y: 54, scale: 0.86 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.18, duration: 0.65, ease }}>فكرة</motion.div>
      <motion.div className="s1-second" initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.22, duration: 0.45, ease }}>تستحق</motion.div>
      <motion.div className="s1-caption" initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }} animate={{ opacity: 1, clipPath: 'inset(0 0 0 0)' }} transition={{ delay: 2.45, duration: 0.5, ease }}>حضورًا رقميًا يليق بها</motion.div>
    </div>
    <motion.div className="s1-rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 1.0, duration: 0.55, ease }} />
    <motion.div className="s1-aperture" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 5.8], opacity: [0, 1, 1] }} transition={{ delay: 3.72, duration: 0.78, ease }} />
    <motion.div className="s1-push" animate={{ scale: [1, 1.08, 1.35], opacity: [0, 0.8, 0] }} transition={{ delay: 3.7, duration: 0.78 }} />
  </motion.section>;
}
