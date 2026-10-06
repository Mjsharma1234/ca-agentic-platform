export const api = {
  get: async (url: string) => {
    // In a real app this would fetch from the backend
    // We are mocking it for this implementation
    return { data: null, error: null };
  },
  post: async (url: string, body: any) => {
    return { data: null, error: null };
  }
};
