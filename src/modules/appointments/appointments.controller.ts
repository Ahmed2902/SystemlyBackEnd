import { Request, Response } from "express";
import * as service from "./appointments.service";
import { ok, fail } from "../../shared/utils/response.util";

export const listAppointments = async (req: Request, res: Response) => {
  try {
    const { date, from, to, page, perPage } = req.query as any;
    const user = req.user;
    const data = await service.listAppointments({
      user,
      date,
      from,
      to,
      page,
      perPage,
    });
    return ok(res, data);
  } catch (err: any) {
    return fail(
      res,
      err.message || "Could not list appointments",
      err.statusCode || 500
    );
  }
};

export const getAppointment = async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const appt = await service.getAppointmentById(id);
    if (!appt) return fail(res, "Not found", 404);
    return ok(res, appt);
  } catch (err: any) {
    return fail(res, err.message || "Error", err.statusCode || 500);
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status } = req.body;
    const updated = await service.updateStatus(id, status);
    return ok(res, updated);
  } catch (err: any) {
    return fail(
      res,
      err.message || "Could not update status",
      err.statusCode || 400
    );
  }
};

export const updateNotes = async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { notes } = req.body;
    const updated = await service.updateNotes(id, notes);
    return ok(res, updated);
  } catch (err: any) {
    return fail(
      res,
      err.message || "Could not update notes",
      err.statusCode || 400
    );
  }
};

export const createAppointment = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const created = await service.createManualAppointment(payload);
    return ok(res, created, 201);
  } catch (err: any) {
    return fail(
      res,
      err.message || "Could not create appointment",
      err.statusCode || 400
    );
  }
};

export default {
  listAppointments,
  getAppointment,
  updateStatus,
  updateNotes,
  createAppointment,
};
