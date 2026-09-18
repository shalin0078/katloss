export interface SampleImage {
  id: string;
  title: string;
  category: string;
  url: string;
  defaultBox: { x: number; y: number; width: number; height: number };
}

export interface SampleVideo {
  id: string;
  title: string;
  url: string;
  defaultBox: {
    x: number;
    y: number;
    width: number;
    height: number;
    start_time?: number;
    end_time?: number;
    display_width?: number;
    display_height?: number;
  };
}

export const SAMPLE_IMAGES: SampleImage[] = [
  {
    id: "sample-demo",
    title: "Watermarked Photo",
    category: "Test Asset",
    url: "/samples/sample_photo.png",
    defaultBox: { x: 520, y: 40, width: 230, height: 60 },
  },
  {
    id: "sample-1",
    title: "Cinematic Portrait",
    category: "Photography",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=1000&auto=format&fit=crop",
    defaultBox: { x: 40, y: 40, width: 220, height: 60 },
  },
  {
    id: "sample-2",
    title: "Minimal Architecture",
    category: "Design",
    url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=1000&auto=format&fit=crop",
    defaultBox: { x: 700, y: 550, width: 250, height: 70 },
  },
];

export const SAMPLE_VIDEOS: SampleVideo[] = [
  {
    id: "sample-demo-video",
    title: "Demo Watermark Clip",
    url: "/samples/demo_sample_watermark.mp4",
    defaultBox: {
      x: 420,
      y: 30,
      width: 190,
      height: 50,
      start_time: 0,
      end_time: 3,
      display_width: 640,
      display_height: 360,
    },
  },
  {
    id: "sample-video-2",
    title: "Prisma Visual Loop",
    url: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4",
    defaultBox: {
      x: 30,
      y: 30,
      width: 140,
      height: 50,
      start_time: 0,
      end_time: 5,
    },
  },
];
