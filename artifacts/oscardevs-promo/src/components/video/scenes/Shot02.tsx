import { motion } from 'framer-motion';
const ease = [0.22, 1, 0.36, 1] as const;
export function Shot02() {
 return <motion.section className="film-scene paper-field" initial={{ opacity: 0, clipPath: 'circle(0% at 16% 48%)' }} animate={{ opacity: 1, clipPath: 'circle(150% at 16% 48%)' }} exit={{ opacity: 0, scale: 1.08, transition: { duration: 0.36 } }} transition={{ duration: 0.68, ease }}>
   <div className="paper-grain"/><div className="shot-index ink-meta">OSCARDEVS / FROM IDEA TO FORM <i>02—06</i></div>
   <motion.div className="blueprint-ring" initial={{ scale: 0, rotate: -50 }} animate={{ scale: 1, rotate: 0 }} transition={{ duration: 0.7, ease }}><span/></motion.div>
   <div className="s2-head" dir="rtl"><motion.p initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .25, duration: .48, ease }}>من الفكرة</motion.p><motion.h2 initial={{ opacity: 0, y: 46 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: .55, ease }}>إلى البناء</motion.h2><motion.div className="s2-label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.8 }}><span>تصميم</span><b>•</b><span>تطوير</span><b>•</b><span>حضور</span></motion.div></div>
   <div className="rails">
    <motion.div className="rail rail-a" initial={{ scaleX: 0, rotate: -4 }} animate={{ scaleX: 1, rotate: -4 }} transition={{ delay: .1, duration: 1.2, ease }}/>
    <motion.div className="rail rail-b" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: .55, duration: .9, ease }}/>
    <motion.div className="rail rail-c" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: .85, duration: .7, ease }}/>
    <motion.div className="browser-outline" initial={{ opacity: 0, scale: .74, rotateY: 22 }} animate={{ opacity: 1, scale: [1.18, 1], rotateY: 0 }} transition={{ delay: 1.15, duration: 1, ease }}><div className="browser-top"><i/><i/><i/><span>IDEA / 01</span></div><div className="browser-lines"><b/><b/><b/><b/></div><div className="browser-tile"/></motion.div>
   </div>
   <motion.div className="s2-carrier" initial={{ scaleX: .1, opacity: 0 }} animate={{ scaleX: [1, 7], opacity: [1, 0] }} transition={{ delay: 4.05, duration: .8, ease }}/>
 </motion.section>;
}
