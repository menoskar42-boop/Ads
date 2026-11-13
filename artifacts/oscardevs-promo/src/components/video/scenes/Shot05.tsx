import { motion } from 'framer-motion';
const ease = [0.22, 1, 0.36, 1] as const;
function MiniPage({ variant }: { variant: number }) { return <div className={'mini-page mini-' + variant}><div className="mini-top"><i/><i/><i/></div><div className="mini-visual"><span/><b/><i/></div><div className="mini-text"><i/><i/><i/></div><div className="mini-bottom">O / DIGITAL</div></div>; }
export function Shot05() {
 return <motion.section className="film-scene ink-field s5-field" initial={{ opacity: 0, clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)' }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: .3 } }} transition={{ duration: .3 }}>
  <div className="grid-veil"/><div className="shot-index">OSCARDEVS / YOUR PRESENCE, IN FOCUS <i>05—06</i></div>
  <motion.div className="s5-rail" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: .65, ease }}/>
  <motion.div className="panel panel-left" initial={{ opacity: 0, x: -90, rotateY: 18 }} animate={{ opacity: 1, x: 0, rotateY: 8 }} transition={{ delay: .24, duration: .7, ease }}><MiniPage variant={1}/></motion.div>
  <motion.div className="panel panel-center" initial={{ opacity: 0, y: 70, scale: .82 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: .4, duration: .75, ease }}><MiniPage variant={2}/></motion.div>
  <motion.div className="panel panel-right" initial={{ opacity: 0, x: 90, rotateY: -18 }} animate={{ opacity: 1, x: 0, rotateY: -8 }} transition={{ delay: .58, duration: .7, ease }}><MiniPage variant={3}/></motion.div>
  <motion.div className="s5-title" dir="rtl" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.35, duration: .5, ease }}>حضورك يبدأ هنا</motion.div>
  <motion.div className="s5-domain">OscarDevs.com</motion.div>
  <motion.div className="s5-aperture" initial={{ scale: 0 }} animate={{ scale: [0, 1, 0.04], opacity: [0, 1, 1] }} transition={{ delay: 4.08, duration: .85, ease }}/>
 </motion.section>;
}
