import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getLocales } from 'expo-localization';
import { storage } from './storage';

export type Lang = 'ar' | 'en';

const ar = {
  appName: 'تراخيص',
  tagline: 'تصاريح وبوابات ورحلات شاحنات النفايات في مكان واحد',
  common: {
    save: 'حفظ', cancel: 'إلغاء', add: 'إضافة', edit: 'تعديل', delete: 'حذف', close: 'إغلاق', confirm: 'تأكيد', back: 'رجوع',
    loading: 'جارٍ التحميل…', retry: 'إعادة المحاولة', search: 'بحث', none: 'لا يوجد', all: 'الكل', yes: 'نعم', no: 'لا',
    today: 'اليوم', optional: 'اختياري', required: 'مطلوب', open: 'فتح', share: 'مشاركة', refresh: 'تحديث', details: 'التفاصيل',
    minutesAgo: (n: number) => (n <= 0 ? 'الآن' : n === 1 ? 'قبل دقيقة' : `قبل ${n} دقيقة`),
    daysLeft: (n: number) => (n < 0 ? `منتهي منذ ${-n} يوم` : n === 0 ? 'ينتهي اليوم' : `باقي ${n} يوم`),
    km: (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} كم` : `${m} م`),
    sar: 'ر.س',
  },
  auth: {
    login: 'تسجيل الدخول', logout: 'تسجيل الخروج', phone: 'رقم الجوال', password: 'كلمة المرور', phoneHint: '05XXXXXXXX',
    noAccount: 'شركة جديدة؟ سجّل شركتك', haveAccount: 'لديك حساب؟ سجّل الدخول', register: 'تسجيل شركة جديدة',
    companyName: 'اسم الشركة', crNumber: 'رقم السجل التجاري', yourName: 'اسمك', passwordHint: '8 أحرف على الأقل', createAccount: 'إنشاء الحساب',
    changePassword: 'تغيير كلمة المرور', currentPassword: 'كلمة المرور الحالية', newPassword: 'كلمة المرور الجديدة',
    inviteCode: 'رمز الدعوة', inviteHint: 'التسجيل حالياً للشركات المشاركة في التجربة فقط',
    locationSharing: 'مشاركة الموقع أثناء الرحلات', consentGiven: 'موافق', withdraw: 'سحب الموافقة',
  },
  roles: { owner: 'المالك', manager: 'مشرف / موارد بشرية', safety: 'السلامة والأمن', gate: 'حارس البوابة', driver: 'سائق' },
  tabs: { home: 'الرئيسية', live: 'مباشر', schedule: 'الجدول', fleet: 'الأسطول', more: 'المزيد', scan: 'مسح', log: 'السجل', pass: 'تصريحي', trip: 'الرحلة', week: 'أسبوعي', docs: 'مستنداتي', profile: 'حسابي' },
  docTypes: {
    national_id: 'الهوية الوطنية', iqama: 'الإقامة', driving_license: 'رخصة القيادة', health_certificate: 'الشهادة الصحية',
    vehicle_registration: 'استمارة المركبة', insurance: 'تأمين المركبة', operating_card: 'بطاقة التشغيل', landfill_permit: 'تصريح دخول المردم',
    commercial_registration: 'السجل التجاري', waste_transporter_qualification: 'شهادة تأهيل ناقل النفايات', mwan_license: 'ترخيص المركز الوطني لإدارة النفايات',
    other: 'مستند آخر', photo: 'صورة شخصية',
  } as Record<string, string>,
  requirements: { identity: 'الهوية / الإقامة', driving_license: 'رخصة القيادة', vehicle_registration: 'استمارة المركبة', insurance: 'التأمين', landfill_permit: 'تصريح دخول المردم' } as Record<string, string>,
  docStates: { valid: 'ساري', expiring: 'ينتهي قريباً', expired: 'منتهي', pending: 'قيد المراجعة', rejected: 'مرفوض', missing: 'غير موجود' } as Record<string, string>,
  owners: { driver: 'الموظف', vehicle: 'شاحنة', company: 'الشركة' } as Record<string, string>,
  docs: {
    title: 'المستندات', upload: 'رفع مستند', uploadFor: 'رفع مستند لـ', type: 'نوع المستند', number: 'رقم المستند', issueDate: 'تاريخ الإصدار',
    expiryDate: 'تاريخ الانتهاء', dateHint: 'YYYY-MM-DD', file: 'الملف', takePhoto: 'تصوير', chooseFile: 'اختيار ملف / صورة', noFile: 'لم يتم اختيار ملف',
    approve: 'اعتماد', reject: 'رفض', review: 'مراجعة', attention: 'تحتاج إجراء', reviewQueue: 'بانتظار المراجعة', companyDocs: 'مستندات الشركة',
    viewFile: 'عرض الملف', site: 'المردم / الموقع', anySite: 'كل المواقع', uploadedPending: 'تم الرفع — بانتظار مراجعة قسم السلامة', notes: 'ملاحظات',
    missingTitle: 'مستندات ناقصة', hijri: 'هجري', gregorian: 'ميلادي', hijriHint: 'اكتب التاريخ الهجري كما هو مطبوع: YYYY-MM-DD (مثال 1449-05-14)', equals: 'يوافق',
  },
  alerts: { title: 'تنبيهات', expired: 'منتهي', expiring: 'ينتهي قريباً', pending: 'بانتظار المراجعة', missing: 'ناقص', rejected: 'مرفوض', allGood: 'كل المستندات سارية 👍' } as Record<string, string>,
  dash: {
    drivers: 'السائقون', vehicles: 'الشاحنات', enRoute: 'في الطريق', arrived: 'وصلت', completedToday: 'رحلات مكتملة اليوم', scheduledToday: 'رحلات مخططة اليوم',
    gateAllowed: 'دخول مسموح اليوم', gateDenied: 'دخول مرفوض اليوم', draftInvoices: 'فواتير مسودة', unpaid: 'مستحقات غير محصلة', docsExpired: 'مستندات منتهية', docsExpiring: 'تنتهي خلال 30 يوم', docsPending: 'بانتظار المراجعة',
  },
  live: {
    title: 'الشاحنات الآن', none: 'لا توجد شاحنات في الطريق حالياً', arrivedToday: 'وصلت اليوم', lastUpdate: 'آخر تحديث', distance: 'المسافة للمردم', map: 'الخريطة',
    started: 'بدأت', arrivedAt: 'وصلت', via: { geofence: 'تلقائي (الموقع)', gate: 'مسح البوابة', driver: 'السائق', manager: 'المشرف', on_complete: 'عند الإنهاء' } as Record<string, string>,
    gateToday: 'سجل البوابة اليوم',
  },
  tripStatus: { en_route: 'في الطريق', arrived: 'وصل', completed: 'مكتملة', cancelled: 'ملغاة' } as Record<string, string>,
  schedule: {
    title: 'جدول الأسبوع', add: 'إضافة للجدول', copyWeek: 'نسخ الأسبوع للأسبوع القادم', copied: (n: number) => `تم نسخ ${n} سطر`, empty: 'لا يوجد أحد في الجدول لهذا اليوم',
    driver: 'السائق', vehicle: 'الشاحنة', site: 'الموقع', shift: 'الوردية', plannedTrips: 'عدد الرحلات', date: 'التاريخ', trips: (done: number, planned: number) => `${done}/${planned} رحلات`,
    shifts: { morning: 'صباحية', evening: 'مسائية', night: 'ليلية' } as Record<string, string>, prevWeek: 'الأسبوع السابق', nextWeek: 'الأسبوع التالي', expected: 'المتوقع اليوم', entered: 'دخل',
  },
  days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  fleet: {
    drivers: 'السائقون', vehicles: 'الشاحنات', sites: 'المواقع', staff: 'الموظفون', addDriver: 'إضافة سائق', addVehicle: 'إضافة شاحنة', addSite: 'إضافة موقع', addUser: 'إضافة موظف',
    plate: 'رقم اللوحة', type: 'نوع الشاحنة', capacity: 'الحمولة (طن)', idType: 'نوع الهوية', idNumber: 'رقم الهوية / الإقامة', nationality: 'الجنسية', license: 'رقم الرخصة',
    truck: 'الشاحنة المخصصة', noTruck: 'بدون شاحنة', inactive: 'موقوف', role: 'الدور', tempPassword: 'كلمة المرور المؤقتة', tempPasswordHint: 'شاركها مع الموظف — لن تظهر مرة أخرى',
    resetPassword: 'إعادة تعيين كلمة المرور', deactivate: 'إيقاف الحساب', activate: 'تفعيل الحساب', siteName: 'اسم الموقع', lat: 'خط العرض', lng: 'خط الطول', radius: 'نطاق الوصول (متر)',
    passwordOptional: 'كلمة المرور (اختياري)', passwordOptionalHint: 'اتركها فارغة لإنشاء كلمة مؤقتة تلقائياً — 8 أحرف على الأقل',
    passwordTitle: 'كلمة المرور', setPassword: 'حفظ', generateTemp: 'كلمة مؤقتة', passwordSaved: 'تم حفظ كلمة المرور الجديدة ✔',
    passwordHelp: 'اكتب كلمة مرور جديدة وأرسلها للموظف، أو أنشئ كلمة مؤقتة.', shareLogin: 'مشاركة بيانات الدخول', copied: 'تم النسخ ✔',
    loginMessage: (name: string, phone: string, password: string, link: string) =>
      `تراخيص — بيانات دخول ${name}\nالرابط: ${link}\nرقم الجوال: ${phone}\nكلمة المرور: ${password}`,
    staffMember: 'الموظف',
    useMyLocation: 'استخدام موقعي الحالي', radiusHint: 'عند دخول الشاحنة هذا النطاق يُسجَّل وصولها تلقائياً', issues: (n: number) => `${n} مستند يحتاج إجراء`, setPhoto: 'تغيير الصورة', driverOf: 'السائق',
  },
  gate: {
    scanTitle: 'مسح تصريح السائق', scanHint: 'وجّه الكاميرا إلى رمز QR في جوال السائق', orCode: 'أو أدخل الرمز المكون من 6 أرقام', verify: 'تحقق',
    allowed: 'مسموح بالدخول', denied: 'غير مسموح بالدخول', scanAgain: 'مسح سائق آخر', site: 'البوابة / الموقع', direction: 'الاتجاه', in: 'دخول', out: 'خروج',
    cameraDenied: 'لا يوجد إذن للكاميرا — استخدم الرمز المكون من 6 أرقام', cameraAllow: 'السماح بالكاميرا', notScheduled: 'السائق غير مدرج في جدول اليوم', expiringNote: 'ينتهي قريباً',
    reasons: {
      DRIVER_NOT_FOUND: 'السائق غير موجود', DRIVER_INACTIVE: 'حساب السائق موقوف', NO_VEHICLE: 'لا توجد شاحنة مرتبطة', VEHICLE_INACTIVE: 'الشاحنة موقوفة',
      DOC_MISSING: 'غير موجود', DOC_EXPIRED: 'منتهي', DOC_PENDING: 'قيد المراجعة', DOC_REJECTED: 'مرفوض',
    } as Record<string, string>,
    logTitle: 'سجل البوابة', noLogs: 'لا يوجد مسح بعد', publicScan: 'تحقق عبر الرابط',
  },
  pass: {
    title: 'تصريح الدخول', show: 'اعرض هذا الرمز لحارس البوابة', code: 'الرمز', refreshesIn: (s: string) => `يتجدد خلال ${s}`, statusOk: 'جاهز للدخول', statusBad: 'لن يُسمح لك بالدخول',
    fix: 'ارفع المستندات الناقصة أو تواصل مع قسم السلامة', offline: 'لا يوجد اتصال — آخر رمز محفوظ', vehicle: 'الشاحنة',
  },
  trip: {
    start: 'بدء رحلة', startHint: 'ابدأ الرحلة عند تحميل الشاحنة. سيتم إرسال موقعك تلقائياً وتسجيل الوصول عند دخول المردم.', loadType: 'نوع الحمولة', site: 'الوجهة',
    arrived: 'وصلت', arrivedManual: 'تأكيد الوصول يدوياً', complete: 'إنهاء الرحلة', cancel: 'إلغاء الرحلة', weight: 'الوزن (طن)', ticketNumber: 'رقم كرت الوزن', ticketPhoto: 'صورة كرت الوزن',
    tracking: 'يتم إرسال موقعك', trackingOff: 'الموقع غير مفعّل', locationDenied: 'اسمح بالوصول للموقع لتسجيل الوصول تلقائياً', history: 'رحلاتي', done: 'تم إنهاء الرحلة ✔', fromSchedule: 'من جدول اليوم',
    sendLocation: 'إرسال موقعي الآن', keepOpen: 'أبقِ التطبيق مفتوحاً أثناء الرحلة',
    trackingBackground: 'يتم إرسال موقعك حتى لو أغلقت التطبيق — يتوقف تلقائياً عند إنهاء الرحلة',
    notifTitle: 'تراخيص — رحلة جارية', notifBody: 'تتم مشاركة موقع الشاحنة حتى إنهاء الرحلة',
    consentTitle: 'مشاركة الموقع أثناء الرحلات',
    consentPoints: [
      'يُشارَك موقع الشاحنة فقط من بدء الرحلة حتى إنهائها — لا يتم تتبعك خارج الرحلات.',
      'يرى الموقع مشرفو شركتك فقط، ويُستخدم لتأكيد الوصول إلى المردم ومتابعة الحمولة.',
      'عند الطلب اختر «السماح طوال الوقت» حتى يستمر الإرسال إذا أُغلق التطبيق أثناء الرحلة.',
      'يمكنك سحب الموافقة في أي وقت من صفحة «حسابي».',
    ],
    consentAgree: 'أوافق',
  },
  invoices: {
    title: 'الفواتير الأسبوعية', generate: 'إنشاء فاتورة الأسبوع', client: 'العميل', clientVat: 'الرقم الضريبي للعميل', pricing: 'طريقة التسعير', perTrip: 'لكل رحلة', perTon: 'لكل طن',
    unitPrice: 'سعر الوحدة (ر.س)', week: 'الأسبوع', tripsReady: (n: number) => `${n} رحلة مكتملة غير مفوترة`, subtotal: 'المجموع', vat: 'ضريبة القيمة المضافة 15%', total: 'الإجمالي',
    approve: 'اعتماد الفاتورة', markPaid: 'تسجيل كمدفوعة', print: 'طباعة / PDF', lines: 'البنود', addLine: 'إضافة بند', description: 'الوصف', qty: 'الكمية', price: 'السعر',
    status: { draft: 'مسودة', approved: 'معتمدة', paid: 'مدفوعة' } as Record<string, string>, empty: 'لا توجد فواتير بعد', units: { trip: 'رحلة', ton: 'طن', item: 'بند' } as Record<string, string>,
    deleteDraft: 'حذف المسودة', zatcaNote: 'ملاحظة: الربط مع منصة فاتورة (ZATCA) غير مفعّل بعد',
  },
  server: {
    title: 'عنوان الخادم', current: 'الخادم', change: 'تغيير', none: 'اربط التطبيق بخادم شركتك أولاً',
    noneHint: 'اطلب من المشرف فتح «المزيد ← ربط تطبيق الجوال» ثم امسح الرمز، أو الصق الرابط هنا.',
    url: 'رابط الخادم', placeholder: 'https://....trycloudflare.com', scan: 'مسح رمز الربط', save: 'تحقق واحفظ',
    invalid: 'الرابط غير صحيح', unreachable: 'لا يمكن الوصول إلى الخادم — تأكد أن الكمبيوتر يعمل وأن الرابط صحيح',
    saved: 'تم الربط بالخادم ✔', signOutNote: 'تغيير الخادم يسجّل خروجك من الحساب الحالي',
  },
  connect: {
    title: 'ربط تطبيق الجوال', hint: 'على جوال السائق أو الحارس: افتح تطبيق تراخيص ← «تغيير الخادم» ← «مسح رمز الربط» ثم امسح هذا الرمز.',
    linkHint: 'أو أرسل هذا الرابط لهم (يعمل أيضاً من متصفح الجوال مباشرة):', changes: 'إذا أُعيد تشغيل الكمبيوتر يتغير الرابط — اعرض هذا الرمز من جديد.',
    share: 'مشاركة الرابط',
  },
  notif: {
    title: 'التنبيهات', empty: 'لا توجد تنبيهات', markAll: 'تحديد الكل كمقروء', enable: 'تفعيل التنبيهات على هذا الجهاز',
    enabled: 'التنبيهات مفعّلة على هذا الجهاز ✔', denied: 'التنبيهات مرفوضة — فعّلها من إعدادات الجوال/المتصفح',
    enableHint: 'نذكّرك قبل انتهاء أي مستند بـ 30 و14 و7 أيام ويوم واحد، ويوم الانتهاء.',
    pending: 'مستند جديد بانتظار المراجعة', expired: (doc: string) => `انتهت صلاحية ${doc}`,
    expiresIn: (doc: string, d: number) => `${doc}: ${d === 0 ? 'ينتهي اليوم' : d === 1 ? 'ينتهي غداً' : d === 2 ? 'ينتهي خلال يومين' : d <= 10 ? `ينتهي خلال ${d} أيام` : `ينتهي خلال ${d} يوماً`}`,
  },
  personDocs: {
    title: 'مستندات الموظف', hint: 'أضف الإقامة أو الهوية والرخصة الآن، وسنذكّرك قبل انتهائها.', saved: 'تم الحفظ ✔', saveDoc: 'حفظ المستند',
    addOther: 'إضافة مستند آخر', done: 'تم', photo: 'صورة المستند (اختياري)', skip: 'لاحقاً',
  },
  more: { title: 'المزيد', connect: 'ربط تطبيق الجوال', invoices: 'الفواتير', documents: 'مراجعة المستندات', companyDocs: 'مستندات الشركة', gateLog: 'سجل البوابة', staff: 'الموظفون والصلاحيات', company: 'بيانات الشركة', language: 'اللغة', settings: 'الإعدادات' },
  company: { vat: 'الرقم الضريبي', city: 'المدينة', phone: 'هاتف الشركة' },
  errors: {
    NETWORK: 'تعذر الاتصال بالخادم. تحقق من الإنترنت.', BAD_CREDENTIALS: 'رقم الجوال أو كلمة المرور غير صحيحة', INVALID_PHONE: 'أدخل رقم جوال سعودي مثل 05XXXXXXXX',
    PHONE_TAKEN: 'رقم الجوال مسجل مسبقاً', ACCOUNT_DISABLED: 'تم إيقاف هذا الحساب من قبل الشركة', FORBIDDEN: 'لا تملك صلاحية لهذا الإجراء', VALIDATION: 'تحقق من البيانات المدخلة',
    INVALID_ID_NUMBER: 'رقم الهوية غير صحيح (10 أرقام، الهوية تبدأ بـ1 والإقامة بـ2)', PASS_EXPIRED: 'انتهت صلاحية التصريح — اطلب من السائق تحديثه', PASS_INVALID: 'رمز غير صالح',
    PASS_NOT_FOUND: 'الرمز غير موجود أو منتهي', OTHER_COMPANY: 'هذا التصريح تابع لشركة أخرى', TRIP_IN_PROGRESS: 'لديك رحلة جارية — أنهِها أولاً', NO_TRIPS: 'لا توجد رحلات مكتملة لهذا الأسبوع',
    MISSING_WEIGHTS: 'بعض الرحلات بدون وزن — أكمل الأوزان أو استخدم التسعير لكل رحلة', ALREADY_SCHEDULED: 'السائق مجدول في هذه الوردية مسبقاً', FILE_TOO_LARGE: 'الملف كبير جداً (الحد 10 ميجابايت)',
    UNSUPPORTED_FILE: 'نوع الملف غير مدعوم — صورة أو PDF', FILE_OR_EXPIRY_REQUIRED: 'أرفق ملفاً أو أدخل تاريخ الانتهاء', PLATE_TAKEN: 'رقم اللوحة مسجل مسبقاً', INVOICE_LOCKED: 'الفاتورة معتمدة ولا يمكن تعديلها',
    CANNOT_CHANGE_SELF: 'لا يمكنك تغيير دورك أو إيقاف حسابك', LOCATION_CONSENT_REQUIRED: 'وافق على مشاركة الموقع أولاً من شاشة الرحلة',
    INVITE_CODE_INVALID: 'رمز الدعوة غير صحيح', NO_SERVER: 'اربط التطبيق بخادم شركتك أولاً', DEFAULT: 'حدث خطأ، حاول مرة أخرى',
  } as Record<string, string>,
};

type Dict = typeof ar;

const en: Dict = {
  appName: 'Tarakhis',
  tagline: 'Permits, gate checks and truck trips for waste companies — in one app',
  common: {
    save: 'Save', cancel: 'Cancel', add: 'Add', edit: 'Edit', delete: 'Delete', close: 'Close', confirm: 'Confirm', back: 'Back',
    loading: 'Loading…', retry: 'Retry', search: 'Search', none: 'None', all: 'All', yes: 'Yes', no: 'No',
    today: 'Today', optional: 'optional', required: 'required', open: 'Open', share: 'Share', refresh: 'Refresh', details: 'Details',
    minutesAgo: (n: number) => (n <= 0 ? 'just now' : n === 1 ? '1 min ago' : `${n} min ago`),
    daysLeft: (n: number) => (n < 0 ? `expired ${-n} days ago` : n === 0 ? 'expires today' : `${n} days left`),
    km: (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`),
    sar: 'SAR',
  },
  auth: {
    login: 'Sign in', logout: 'Sign out', phone: 'Mobile number', password: 'Password', phoneHint: '05XXXXXXXX',
    noAccount: 'New company? Register', haveAccount: 'Have an account? Sign in', register: 'Register your company',
    companyName: 'Company name', crNumber: 'Commercial registration (CR)', yourName: 'Your name', passwordHint: 'At least 8 characters', createAccount: 'Create account',
    changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password',
    inviteCode: 'Invite code', inviteHint: 'Registration is currently open to pilot companies only',
    locationSharing: 'Location sharing during trips', consentGiven: 'Agreed', withdraw: 'Withdraw consent',
  },
  roles: { owner: 'Owner', manager: 'Supervisor / HR', safety: 'Safety & security', gate: 'Gate guard', driver: 'Driver' },
  tabs: { home: 'Home', live: 'Live', schedule: 'Schedule', fleet: 'Fleet', more: 'More', scan: 'Scan', log: 'Log', pass: 'My pass', trip: 'Trip', week: 'My week', docs: 'Documents', profile: 'Account' },
  docTypes: {
    national_id: 'National ID', iqama: 'Iqama', driving_license: 'Driving licence', health_certificate: 'Health certificate',
    vehicle_registration: 'Vehicle registration (Istimara)', insurance: 'Vehicle insurance', operating_card: 'Operating card', landfill_permit: 'Landfill entry permit',
    commercial_registration: 'Commercial registration', waste_transporter_qualification: 'Waste transporter qualification', mwan_license: 'MWAN licence',
    other: 'Other document', photo: 'Photo',
  },
  requirements: { identity: 'National ID / Iqama', driving_license: 'Driving licence', vehicle_registration: 'Vehicle registration', insurance: 'Insurance', landfill_permit: 'Landfill permit' },
  docStates: { valid: 'Valid', expiring: 'Expiring soon', expired: 'Expired', pending: 'Under review', rejected: 'Rejected', missing: 'Missing' },
  owners: { driver: 'Employee', vehicle: 'Truck', company: 'Company' },
  docs: {
    title: 'Documents', upload: 'Upload document', uploadFor: 'Upload for', type: 'Document type', number: 'Document number', issueDate: 'Issue date',
    expiryDate: 'Expiry date', dateHint: 'YYYY-MM-DD', file: 'File', takePhoto: 'Take photo', chooseFile: 'Choose file / photo', noFile: 'No file selected',
    approve: 'Approve', reject: 'Reject', review: 'Review', attention: 'Needs action', reviewQueue: 'Awaiting review', companyDocs: 'Company documents',
    viewFile: 'View file', site: 'Landfill / site', anySite: 'All sites', uploadedPending: 'Uploaded — waiting for safety review', notes: 'Notes',
    missingTitle: 'Missing documents', hijri: 'Hijri', gregorian: 'Gregorian', hijriHint: 'Type the Hijri date as printed: YYYY-MM-DD (e.g. 1449-05-14)', equals: 'equals',
  },
  alerts: { title: 'Alerts', expired: 'Expired', expiring: 'Expiring', pending: 'Pending review', missing: 'Missing', rejected: 'Rejected', allGood: 'All documents are valid 👍' },
  dash: {
    drivers: 'Drivers', vehicles: 'Trucks', enRoute: 'On the way', arrived: 'Arrived', completedToday: 'Trips completed today', scheduledToday: 'Trips planned today',
    gateAllowed: 'Gate entries today', gateDenied: 'Denied today', draftInvoices: 'Draft invoices', unpaid: 'Unpaid', docsExpired: 'Expired documents', docsExpiring: 'Expiring in 30 days', docsPending: 'Pending review',
  },
  live: {
    title: 'Trucks right now', none: 'No trucks on the road right now', arrivedToday: 'Arrived today', lastUpdate: 'Last update', distance: 'Distance to site', map: 'Map',
    started: 'Started', arrivedAt: 'Arrived', via: { geofence: 'Automatic (GPS)', gate: 'Gate scan', driver: 'Driver', manager: 'Supervisor', on_complete: 'On completion' },
    gateToday: 'Gate log today',
  },
  tripStatus: { en_route: 'On the way', arrived: 'Arrived', completed: 'Completed', cancelled: 'Cancelled' },
  schedule: {
    title: 'Weekly plan', add: 'Add to schedule', copyWeek: 'Copy this week to next week', copied: (n: number) => `${n} rows copied`, empty: 'Nobody scheduled for this day',
    driver: 'Driver', vehicle: 'Truck', site: 'Site', shift: 'Shift', plannedTrips: 'Planned trips', date: 'Date', trips: (done: number, planned: number) => `${done}/${planned} trips`,
    shifts: { morning: 'Morning', evening: 'Evening', night: 'Night' }, prevWeek: 'Previous week', nextWeek: 'Next week', expected: 'Expected today', entered: 'Entered',
  },
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  fleet: {
    drivers: 'Drivers', vehicles: 'Trucks', sites: 'Sites', staff: 'Staff', addDriver: 'Add driver', addVehicle: 'Add truck', addSite: 'Add site', addUser: 'Add staff member',
    plate: 'Plate number', type: 'Truck type', capacity: 'Capacity (tons)', idType: 'ID type', idNumber: 'ID / Iqama number', nationality: 'Nationality', license: 'Licence number',
    truck: 'Assigned truck', noTruck: 'No truck', inactive: 'Disabled', role: 'Role', tempPassword: 'Temporary password', tempPasswordHint: 'Share it with the user — it will not be shown again',
    resetPassword: 'Reset password', deactivate: 'Disable account', activate: 'Enable account', siteName: 'Site name', lat: 'Latitude', lng: 'Longitude', radius: 'Arrival radius (m)',
    passwordOptional: 'Password (optional)', passwordOptionalHint: 'Leave empty to create a temporary one — at least 8 characters',
    passwordTitle: 'Password', setPassword: 'Save password', generateTemp: 'Create temporary password', passwordSaved: 'New password saved ✔',
    passwordHelp: 'Type a new password and send it to the employee, or create a temporary one.', shareLogin: 'Share login details', copied: 'Copied ✔',
    loginMessage: (name: string, phone: string, password: string, link: string) =>
      `Tarakhis — login for ${name}\nLink: ${link}\nMobile: ${phone}\nPassword: ${password}`,
    staffMember: 'Staff member',
    useMyLocation: 'Use my current location', radiusHint: 'When a truck enters this radius, its arrival is recorded automatically', issues: (n: number) => `${n} document(s) need action`, setPhoto: 'Change photo', driverOf: 'Driver',
  },
  gate: {
    scanTitle: 'Scan driver pass', scanHint: 'Point the camera at the QR code on the driver\'s phone', orCode: 'or enter the 6-digit code', verify: 'Verify',
    allowed: 'ENTRY ALLOWED', denied: 'ENTRY DENIED', scanAgain: 'Scan next driver', site: 'Gate / site', direction: 'Direction', in: 'In', out: 'Out',
    cameraDenied: 'No camera permission — use the 6-digit code', cameraAllow: 'Allow camera', notScheduled: 'Driver is not on today\'s schedule', expiringNote: 'Expiring soon',
    reasons: {
      DRIVER_NOT_FOUND: 'Driver not found', DRIVER_INACTIVE: 'Driver account disabled', NO_VEHICLE: 'No truck linked', VEHICLE_INACTIVE: 'Truck disabled',
      DOC_MISSING: 'Missing', DOC_EXPIRED: 'Expired', DOC_PENDING: 'Under review', DOC_REJECTED: 'Rejected',
    },
    logTitle: 'Gate log', noLogs: 'No scans yet', publicScan: 'Link check',
  },
  pass: {
    title: 'Gate pass', show: 'Show this code to the gate guard', code: 'Code', refreshesIn: (s: string) => `Refreshes in ${s}`, statusOk: 'Ready to enter', statusBad: 'You will not be allowed in',
    fix: 'Upload the missing documents or contact the safety team', offline: 'Offline — showing last saved code', vehicle: 'Truck',
  },
  trip: {
    start: 'Start trip', startHint: 'Start the trip once the truck is loaded. Your location is shared automatically and arrival is recorded when you reach the landfill.', loadType: 'Load type', site: 'Destination',
    arrived: 'Arrived', arrivedManual: 'Confirm arrival manually', complete: 'Finish trip', cancel: 'Cancel trip', weight: 'Weight (tons)', ticketNumber: 'Weight ticket number', ticketPhoto: 'Weight ticket photo',
    tracking: 'Sharing your location', trackingOff: 'Location is off', locationDenied: 'Allow location access to record arrival automatically', history: 'My trips', done: 'Trip completed ✔', fromSchedule: 'From today\'s schedule',
    sendLocation: 'Send my location now', keepOpen: 'Keep the app open during the trip',
    trackingBackground: 'Sharing your location even if you close the app — stops automatically when the trip ends',
    notifTitle: 'Tarakhis — trip in progress', notifBody: 'Sharing the truck location until the trip ends',
    consentTitle: 'Location sharing during trips',
    consentPoints: [
      'The truck location is shared only from trip start until you finish it — never outside trips.',
      'Only your company\'s supervisors can see it; it confirms arrival at the landfill and tracks the load.',
      'When asked, choose "Allow all the time" so sharing continues if the app is closed during a trip.',
      'You can withdraw consent at any time from the Account page.',
    ],
    consentAgree: 'I agree',
  },
  invoices: {
    title: 'Weekly invoices', generate: 'Create this week\'s invoice', client: 'Client', clientVat: 'Client VAT number', pricing: 'Pricing', perTrip: 'Per trip', perTon: 'Per ton',
    unitPrice: 'Unit price (SAR)', week: 'Week', tripsReady: (n: number) => `${n} completed trips not yet invoiced`, subtotal: 'Subtotal', vat: 'VAT 15%', total: 'Total',
    approve: 'Approve invoice', markPaid: 'Mark as paid', print: 'Print / PDF', lines: 'Lines', addLine: 'Add line', description: 'Description', qty: 'Qty', price: 'Price',
    status: { draft: 'Draft', approved: 'Approved', paid: 'Paid' }, empty: 'No invoices yet', units: { trip: 'trip', ton: 'ton', item: 'item' },
    deleteDraft: 'Delete draft', zatcaNote: 'Note: ZATCA (Fatoora) e-invoicing integration is not enabled yet',
  },
  server: {
    title: 'Server address', current: 'Server', change: 'Change', none: 'Connect the app to your company server first',
    noneHint: 'Ask your supervisor to open "More → Connect mobile app" and scan the code, or paste the link here.',
    url: 'Server link', placeholder: 'https://....trycloudflare.com', scan: 'Scan connect code', save: 'Check & save',
    invalid: 'Invalid link', unreachable: 'Cannot reach the server — make sure the computer is on and the link is right',
    saved: 'Connected to the server ✔', signOutNote: 'Changing the server signs you out of the current account',
  },
  connect: {
    title: 'Connect mobile app', hint: 'On the driver or guard phone: open Tarakhis → "Change" server → "Scan connect code", then scan this code.',
    linkHint: 'Or send them this link (it also works directly in the phone browser):', changes: 'If the computer restarts, the link changes — show this code again.',
    share: 'Share link',
  },
  notif: {
    title: 'Notifications', empty: 'No notifications', markAll: 'Mark all as read', enable: 'Enable notifications on this device',
    enabled: 'Notifications are on for this device ✔', denied: 'Notifications are blocked — allow them in the phone/browser settings',
    enableHint: 'We remind you 30, 14, 7 and 1 day before any document expires, and on the day itself.',
    pending: 'New document awaiting review', expired: (doc: string) => `${doc} has expired`,
    expiresIn: (doc: string, d: number) => `${doc} ${d === 0 ? 'expires today' : d === 1 ? 'expires tomorrow' : `expires in ${d} days`}`,
  },
  personDocs: {
    title: 'Employee documents', hint: 'Add the iqama / ID and licence now — we will remind you before they expire.', saved: 'Saved ✔', saveDoc: 'Save document',
    addOther: 'Add another document', done: 'Done', photo: 'Document photo (optional)', skip: 'Later',
  },
  more: { title: 'More', connect: 'Connect mobile app', invoices: 'Invoices', documents: 'Review documents', companyDocs: 'Company documents', gateLog: 'Gate log', staff: 'Staff & roles', company: 'Company details', language: 'Language', settings: 'Settings' },
  company: { vat: 'VAT number', city: 'City', phone: 'Company phone' },
  errors: {
    NETWORK: 'Could not reach the server. Check your connection.', BAD_CREDENTIALS: 'Wrong mobile number or password', INVALID_PHONE: 'Enter a Saudi mobile like 05XXXXXXXX',
    PHONE_TAKEN: 'This mobile number is already registered', ACCOUNT_DISABLED: 'This account was disabled by your company', FORBIDDEN: 'You don\'t have permission for this', VALIDATION: 'Please check the entered data',
    INVALID_ID_NUMBER: 'Invalid ID number (10 digits; national ID starts with 1, iqama with 2)', PASS_EXPIRED: 'Pass expired — ask the driver to refresh it', PASS_INVALID: 'Invalid code',
    PASS_NOT_FOUND: 'Code not found or expired', OTHER_COMPANY: 'This pass belongs to another company', TRIP_IN_PROGRESS: 'You already have a trip in progress', NO_TRIPS: 'No completed trips for this week',
    MISSING_WEIGHTS: 'Some trips have no weight — add weights or price per trip', ALREADY_SCHEDULED: 'Driver already scheduled for that shift', FILE_TOO_LARGE: 'File too large (max 10 MB)',
    UNSUPPORTED_FILE: 'Unsupported file — use a photo or PDF', FILE_OR_EXPIRY_REQUIRED: 'Attach a file or enter the expiry date', PLATE_TAKEN: 'Plate number already exists', INVOICE_LOCKED: 'Approved invoices cannot be edited',
    CANNOT_CHANGE_SELF: 'You cannot change your own role or disable yourself', LOCATION_CONSENT_REQUIRED: 'Agree to location sharing first (Trip screen)',
    INVITE_CODE_INVALID: 'Invalid invite code', NO_SERVER: 'Connect the app to your company server first', DEFAULT: 'Something went wrong, please try again',
  },
};

const dictionaries: Record<Lang, Dict> = { ar, en };

type I18nValue = { lang: Lang; t: Dict; isRTL: boolean; setLang: (l: Lang) => void; errorText: (e: unknown) => string };

const I18nContext = createContext<I18nValue | null>(null);
const LANG_KEY = 'tarakhis.lang';

export function I18nProvider({ children }: { children: ReactNode }) {
  const device = getLocales()[0]?.languageCode === 'en' ? 'en' : 'ar';
  const [lang, setLangState] = useState<Lang>(device);

  useEffect(() => {
    storage.get(LANG_KEY).then((saved) => {
      if (saved === 'ar' || saved === 'en') setLangState(saved);
    });
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.title = lang === 'ar' ? 'تراخيص' : 'Tarakhis';
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.set(LANG_KEY, l);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = dictionaries[lang];
    return {
      lang,
      t,
      isRTL: lang === 'ar',
      setLang,
      errorText: (e: any) => {
        const code = e?.code as string | undefined;
        if (code && t.errors[code]) return t.errors[code];
        if (code === 'VALIDATION' && e?.message) return `${t.errors.VALIDATION}: ${e.message}`;
        return e?.message && lang === 'en' ? e.message : t.errors.DEFAULT;
      },
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
