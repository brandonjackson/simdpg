import { NextRequest, NextResponse } from "next/server";
import { identity, health, benefits } from "@/lib/systems";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const nationalId = searchParams.get("national_id");
  const citizenId = searchParams.get("citizen_id");
  const programStatus = searchParams.get("program_status");

  try {
    if (type === "citizen" && nationalId) {
      const citizens = await identity.getCitizenByNationalId(nationalId);
      if (citizens.length === 0) {
        return NextResponse.json(
          { error: "No citizen found with that national ID" },
          { status: 404 }
        );
      }
      return NextResponse.json(citizens[0]);
    }

    if (type === "citizen-by-id" && citizenId) {
      const citizen = await identity.getCitizen(citizenId);
      return NextResponse.json(citizen);
    }

    if (type === "patient" && citizenId) {
      const patients = await health.getPatientByCitizen(citizenId);
      if (patients.length === 0) {
        return NextResponse.json(
          { error: "No patient record found for this citizen" },
          { status: 404 }
        );
      }
      return NextResponse.json(patients[0]);
    }

    if (type === "programs") {
      const programs = await benefits.getPrograms(programStatus || "active");
      return NextResponse.json(programs);
    }

    return NextResponse.json(
      { error: "Invalid lookup type or missing parameters" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Service unavailable";
    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status: number }).status
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
