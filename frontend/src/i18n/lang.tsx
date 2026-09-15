import { createContext, useContext, useState, ReactNode } from 'react';

const dict: Record<string, Record<string, string>> = {
  en: { sell: 'Sell', purchase: 'Purchase', khata: 'Khata', more: 'More', home: 'Home', todaysReport: "Today's Report", addProduct: 'Add Product', receivePayment: 'Receive Payment', personalPurchase: 'Personal Purchase', scan: 'Scan', voiceSale: 'Voice Sale', uploadBill: 'Upload Bill', todaysSales: "Today's Sales", todaysProfit: "Today's Profit", todaysDue: "Today's Due", lowStock: 'Low Stock', search: 'Search product…' },
  bn: { sell: 'বিক্রি', purchase: 'কেনা', khata: 'খাতা', more: 'আরও', home: 'হোম', todaysReport: 'আজকের হিসাব', addProduct: 'পণ্য যোগ করুন', receivePayment: 'টাকা নিন', personalPurchase: 'ব্যক্তিগত কেনা', scan: 'স্ক্যান', voiceSale: 'ভয়েস বিক্রি', uploadBill: 'বিল আপলোড', todaysSales: 'আজকের বিক্রি', todaysProfit: 'আজকের লাভ', todaysDue: 'আজকের বাকি', lowStock: 'কম স্টক', search: 'পণ্য খুঁজুন…' },
};

const Ctx = createContext<{ lang: string; setLang: (l: string) => void; t: (k: string) => string }>({ lang: 'en', setLang: () => {}, t: (k) => k });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState(localStorage.getItem('lang') || 'en');
  const set = (l: string) => { setLang(l); localStorage.setItem('lang', l); };
  return <Ctx.Provider value={{ lang, setLang: set, t: (k) => dict[lang]?.[k] || dict.en[k] || k }}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);
