export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getAdapterService } = await import('./lib/adapter');
    getAdapterService();
  }
}
