import { motion } from 'framer-motion';
const ease = [0.22, 1, 0.36, 1] as const;
export function Shot04() {
 const tags = ['فكرة', 'واجهة', 'تجربة'];
 return <motion.section className="film-scene mint-field" initial={{ opacity: 0, clipPath: 'inset(0 50% 0 50%)' }} animate={{ opacity: 1, clipPath: 'inset(0 0 0 0)' }} exit={{ opacity: 0, scale: .95, transition: { duration: .36 } }} transition={{ duration: .62, ease }}>
  <div className="paper-grain"/><div className="shot-index ink-meta">OSCARDEVS / DETAILS MAKE THE WHOLE <i>04—06</i></div>
  <motion.div className="s4-title" dir="rtl" initial={{ opacity: 0, y: -28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .48, duration: .55, ease }}>الجمال في التفاصيل</motion.div>
  <motion.div className="s4-divider" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: .15, duration: .7, ease }}/>
  <motion.div className="s4-plate plate-left" initial={{ x: -90, rotateY: -16, opacity: 0 }} animate={{ x: 0, rotateY: 0, opacity: 1 }} transition={{ delay: .15, duration: .8, ease }}><div className="plate-image"><span>O—</span><i/><b/></div><div className="plate-copy"><i/><i/><i/></div><small>01 / STRUCTURE</small></motion.div>
  <motion.div className="s4-plate plate-right" initial={{ x: 90, rotateY: 16, opacity: 0 }} animate={{ x: 0, rotateY: 0, opacity: 1 }} transition={{ delay: .28, duration: .8, ease }}><div className="plate-copy"><i/><i/><i/><i/></div><div className="plate-image alt"><span>FORM</span><i/><b/></div><small>02 / CHARACTER</small></motion.div>
  <div className="s4-tags" dir="rtl">{tags.map((tag,i)=><motion.div key={tag} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6+i*.75, duration: .38, ease }}><b>{'0'+(i+1)}</b><span>{tag}</span><i/></motion.div>)}</div>
  <motion.div className="s4-travel" initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: [0, 1, 5], opacity: [1, 1, 0] }} transition={{ delay: 4.12, duration: .82, ease }}/>
 </motion.section>;
}
