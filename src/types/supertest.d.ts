declare module "supertest" {
  import type { Application } from "express";
  interface Test {
    set(field: string, val: string): this;
    send(body: any): any;
    attach(field: string, file: any, filename?: string): any;
    expect(status: number): any;
  }
  function request(app?: Application | string): any;
  export default request;
}
