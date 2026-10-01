import buildApp from '../server.ts';

export default async function handler(req: any, res: any) {
  const app = await buildApp();
  return (app as any)(req, res);
}
