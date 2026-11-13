import { motion } from 'framer-motion';
const ease = [0.22, 1, 0.36, 1] as const;
function BrowserPanel() { return <div className="site-window"><div className="window-bar"><span className="window-dots"><i/><i/><i/></span><span className="address">oscardevs.com</span><span className="window-mark">O.</span></div><div className="site-content"><div className="site-nav"><span>STUDIO</span><span>PROJECTS</span><span>ABOUT</span><span className="nav-mark">O—</span></div><div className="site-hero"><div className="site-copy" dir="rtl"><small>مساحة لأفكارك</small><b>ابدأ من<br/>هنا.</b><i/><span>شكلٌ واضح، وحضورٌ يشبهك.</span></div><div className="site-art"><div className="art-disc"/><div className="art-arch"/><div className="art-line"/><span>FORM / 01</span></div></div><div className="site-foot"><span>01 / DIGITAL PRESENCE</span><span>OSCAR DEVS</span></div></div></div>; }
export function Shot03() {
 return <motion.section className="film-scene ink-field s3-field" initial={{ opacity: 0, scale: 1.08, clipPath: 'inset(0 0 100% 0)' }} animate={{ opacity: 1, scale: 1, clipPath: 'inset(0 0 0 0)' }} exit={{ opacity: 0, scale: 1.18, transition: { duration: .38 } }} transition={{ duration: .58, ease }}>
   <div className="grid-veil"/><div className="shot-index">OSCARDEVS / A DIGITAL EXPERIENCE <i>03—06</i></div>
   <motion.div className="s3-title" dir="rtl" initial={{ opacity: 0, x: 48 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .25, duration: .5, ease }}>تجربة تترك أثرًا</motion.div>
   <motion.div className="s3-support" dir="rtl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.2 }}>واضحة. متوازنة. لك.</motion.div>
   <motion.div className="s3-browser" initial={{ opacity: 0, y: 60, rotate: 2.5, scale: .88 }} animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }} transition={{ delay: .15, duration: .8, ease }}><BrowserPanel/></motion.div>
   <motion.div className="s3-recompose" initial={{ x: 0 }} animate={{ x: [0, -22, 0] }} transition={{ delay: 2.5, duration: .7, ease }}/>
   <motion.div className="s3-push" initial={{ opacity: 0, scale: 1 }} animate={{ opacity: [0, 1, 0], scale: [1, 1.5, 3.4] }} transition={{ delay: 4.08, duration: .85, ease }}/>
 </motion.section>;
}
