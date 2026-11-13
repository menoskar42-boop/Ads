import { motion } from 'framer-motion';
import homepageScreenshot from '@assets/oscardevs-homepage-brand-reference.png';
const ease = [0.22, 1, 0.36, 1] as const;
export function Shot03() {
 return <motion.section className="film-scene ink-field s3-field" initial={{ opacity: 0, scale: 1.08, clipPath: 'inset(0 0 100% 0)' }} animate={{ opacity: 1, scale: 1, clipPath: 'inset(0 0 0 0)' }} exit={{ opacity: 0, scale: 1.18, transition: { duration: .38 } }} transition={{ duration: .58, ease }}>
    <div className="grid-veil"/><div className="shot-index">OSCARDEVS / THE REAL WEBSITE <i>03—06</i></div>
    <motion.div className="s3-title" dir="rtl" initial={{ opacity: 0, x: 48 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .25, duration: .5, ease }}>هذا موقعنا</motion.div>
    <motion.div className="s3-support" dir="rtl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.2 }}>oscardevs.com</motion.div>
    <motion.div className="s3-browser" initial={{ opacity: 0, y: 60, rotate: 2.5, scale: .88 }} animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }} transition={{ delay: .15, duration: .8, ease }}>
      <div className="real-site-frame">
        <div className="real-site-bar"><span className="window-dots"><i/><i/><i/></span><span>oscardevs.com</span><b>LIVE SITE / HOMEPAGE</b></div>
        <img className="real-site-image" src={homepageScreenshot} alt="لقطة حقيقية للصفحة الرئيسية لموقع OscarDevs.com"/>
      </div>
    </motion.div>
    <motion.div className="s3-recompose" initial={{ opacity: 0, x: 0 }} animate={{ opacity: [0, .72, .72, 0], x: [0, 0, -22, 0] }} transition={{ delay: 1.35, duration: 1.7, times: [0, .28, .72, 1], ease }}/>
   <motion.div className="s3-push" initial={{ opacity: 0, scale: 1 }} animate={{ opacity: [0, 1, 0], scale: [1, 1.5, 3.4] }} transition={{ delay: 4.08, duration: .85, ease }}/>
 </motion.section>;
}
