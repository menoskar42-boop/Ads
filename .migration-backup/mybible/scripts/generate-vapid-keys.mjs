import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('\n✅ مفاتيح VAPID جديدة — انسخها في Replit Secrets:\n');
console.log('VAPID_PUBLIC_KEY=');
console.log(keys.publicKey);
console.log('\nVAPID_PRIVATE_KEY=');
console.log(keys.privateKey);
console.log('\nVAPID_EMAIL=mailto:contact@oscardevs.com');
console.log('\n⚠️  احفظ المفتاح الخاص (PRIVATE) في مكان آمن — لن يظهر مرة أخرى.\n');
