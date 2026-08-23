export type Tor = {
  id: string;
  title: string;
  agency: string;
  budget: number;
  published: string;
  deadline: string;
  category: string;
  status: "เผยแพร่แล้ว" | "รอตรวจสอบ" | "ไม่ผ่าน";
};

export const tors: Tor[] = [
  {
    id: "ai-info-management",
    title: "โครงการพัฒนาระบบบริหารจัดการข้อมูลด้วยปัญญาประดิษฐ์",
    agency: "สำนักดิจิทัลกรุงเทพมหานคร",
    budget: 12500000,
    published: "10 ส.ค. 2569",
    deadline: "30 ส.ค. 2569",
    category: "ปัญญาประดิษฐ์",
    status: "เผยแพร่แล้ว",
  },
  {
    id: "mobile-city-services",
    title: "โครงการพัฒนาแอปพลิเคชันบริการประชาชนบนมือถือ",
    agency: "สำนักงานเมืองอัจฉริยะ กทม.",
    budget: 8500000,
    published: "9 ส.ค. 2569",
    deadline: "29 ส.ค. 2569",
    category: "โมบายแอป",
    status: "เผยแพร่แล้ว",
  },
  {
    id: "web-permit-application",
    title: "โครงการพัฒนาระบบขออนุญาตออนไลน์",
    agency: "กรุงเทพมหานคร",
    budget: 6200000,
    published: "8 ส.ค. 2569",
    deadline: "28 ส.ค. 2569",
    category: "เว็บแอปพลิเคชัน",
    status: "รอตรวจสอบ",
  },
  {
    id: "data-analytics-urban",
    title: "โครงการพัฒนาแพลตฟอร์มวิเคราะห์ข้อมูลผังเมือง",
    agency: "สำนักการวางผังเมือง กทม.",
    budget: 15000000,
    published: "7 ส.ค. 2569",
    deadline: "27 ส.ค. 2569",
    category: "วิเคราะห์ข้อมูล",
    status: "เผยแพร่แล้ว",
  },
  {
    id: "cloud-infrastructure",
    title: "โครงการพัฒนาระบบบริหารโครงสร้างพื้นฐานคลาวด์",
    agency: "สำนักดิจิทัลกรุงเทพมหานคร",
    budget: 9300000,
    published: "6 ส.ค. 2569",
    deadline: "26 ส.ค. 2569",
    category: "คลาวด์",
    status: "เผยแพร่แล้ว",
  },
];

export const categories = [
  { name: "เว็บแอปพลิเคชัน", count: 124 },
  { name: "โมบายแอปพลิเคชัน", count: 98 },
  { name: "ปัญญาประดิษฐ์", count: 56 },
  { name: "วิเคราะห์ข้อมูล", count: 42 },
  { name: "ระบบภูมิสารสนเทศ (GIS)", count: 31 },
];

export const budgetByAgency = [
  { name: "สำนักดิจิทัล กทม.", value: 30 },
  { name: "สำนักงานเมืองอัจฉริยะ", value: 25 },
  { name: "สำนักการวางผังเมือง", value: 20 },
  { name: "สำนักการคลัง กทม.", value: 15 },
  { name: "หน่วยงานอื่น ๆ", value: 10 },
];

export const budgetByCategory = [
  { name: "เว็บแอปพลิเคชัน", value: 30 },
  { name: "โมบายแอปพลิเคชัน", value: 25 },
  { name: "ปัญญาประดิษฐ์", value: 20 },
  { name: "วิเคราะห์ข้อมูล", value: 15 },
  { name: "ระบบภูมิสารสนเทศ", value: 10 },
];

export const budgetByYear = [
  { year: "2565", total: 180 },
  { year: "2566", total: 260 },
  { year: "2567", total: 340 },
  { year: "2568", total: 470 },
  { year: "2569", total: 620 },
];

export const formatTHB = (n: number) => n.toLocaleString("th-TH");
