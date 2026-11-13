import { z } from "zod";

/** موقع من GPS الجوال، مع الدقة بالمتر */
export const gpsSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100_000),
  })
  .nullish();
