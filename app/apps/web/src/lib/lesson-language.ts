export const isThaiLesson = (language?: string) => /^th(?:[-_]|$)/i.test(language?.trim() ?? "");
export const lessonLabels = (language?: string) => isThaiLesson(language) ? {
  back:"กลับไปหน้าเรียน", day:"วันที่", lesson:"บทที่", of:"จาก", lessonDays:"เลือกบทเรียน",
  sections:"ส่วนของบทเรียน", learn:"เรียน", lab:"ลงมือทำ", check:"ทบทวน", content:"เนื้อหาบทเรียน", outline:"ในบทนี้",
  visual:"ภาพประกอบ", steps:"อ่านคำอธิบายแทนภาพ", notes:"เนื้อหาบทเรียน", sources:"แหล่งอ้างอิงและอ่านต่อ",
  knowledge:"เช็กความเข้าใจ", noQuestions:"บทนี้ยังไม่มีคำถาม", noLab:"บทนี้ไม่มีแล็บ", entry:"คำตอบของคุณ",
  submit:"ตรวจคำตอบ", correct:"ถูกต้อง ", incorrect:"ลองทบทวนข้อนี้ ", saved:"คำตอบที่บันทึกไว้",
  prev:"ก่อนหน้า", play:"เล่น", pause:"พัก", next:"ถัดไป", replay:"เล่นใหม่", autoplay:"เล่นอัตโนมัติ", speed:"ความเร็ว", timeline:"แถบเวลา",
  open3d:"เปิดมุมมอง 3 มิติ", flat:"กลับไปภาพ 2 มิติ", unavailable:"เปิดภาพ 3 มิติไม่ได้ ยังดูภาพ 2 มิติและใช้แถบเวลาเดิมได้",
  scene3d:"ฉาก 3 มิติ", left:"หมุนซ้าย", right:"หมุนขวา", up:"เงยขึ้น", down:"ก้มลง", closer:"ขยาย", farther:"ย่อ", reset:"คืนมุมเดิม",
} : {
  back:"Back to Learning", day:"Day", lesson:"Lesson", of:"of", lessonDays:"Lesson days",
  sections:"Lesson sections", learn:"Learn", lab:"Lab", check:"Check", content:"Lesson content", outline:"In this lesson",
  visual:"Interactive visuals", steps:"Read the steps", notes:"Lesson notes", sources:"Sources and further reading",
  knowledge:"Check your understanding", noQuestions:"No questions are assigned to this day.", noLab:"No lab is assigned to this day.", entry:"Your answer",
  submit:"Check answer", correct:"Correct. ", incorrect:"Review this one. ", saved:"saved answers for this lesson",
  prev:"Previous", play:"Play", pause:"Pause", next:"Next", replay:"Replay", autoplay:"Autoplay", speed:"Speed", timeline:"Timeline",
  open3d:"Open 3D view", flat:"Use 2D view", unavailable:"3D is unavailable. The 2D view uses the same timeline and labels.",
  scene3d:"3D scene", left:"Rotate left", right:"Rotate right", up:"Tilt up", down:"Tilt down", closer:"Zoom in", farther:"Zoom out", reset:"Reset view",
};
