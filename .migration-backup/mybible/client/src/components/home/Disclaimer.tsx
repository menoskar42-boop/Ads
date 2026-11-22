import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function Disclaimer() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.5 }}
    >
      <Card className="p-4 bg-muted/30 border-muted">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              هذا التطبيق أداة للدراسة والتعزية الروحية، وليس بديلاً عن الكاهن أو الخادم أو الطبيب النفسي. 
              إذا كنت تمر بوقت صعب، نشجعك على طلب المساعدة من شخص تثق به.
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
