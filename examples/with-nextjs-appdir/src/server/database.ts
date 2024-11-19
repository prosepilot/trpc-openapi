export type User = {
  id: string;
  email: string;
  passcode: number;
  name: string;
};

export type Post = {
  id: string;
  content: string;
  userId: string;
};

export const database: { users: User[]; posts: Post[] } = {
  users: [
    {
      id: '3dcb4a1f-0c91-42c5-834f-26d227c532e2',
      email: 'jb@jamesbe.com',
      passcode: 1234,
      name: 'James',
    },
    {
      id: 'ea120573-2eb4-495e-be48-1b2debac2640',
      email: 'alex@example.com',
      passcode: 9876,
      name: 'Alex',
    },
    {
      id: '2ee1c07c-7537-48f5-b5d8-8740e165cd62',
      email: 'sachin@example.com',
      passcode: 5678,
      name: 'Sachin',
    },
  ],
  posts: [
    {
      id: 'fc206d47-6d50-4b6a-9779-e9eeaee59aa4',
      content: 'Hello world',
      userId: '3dcb4a1f-0c91-42c5-834f-26d227c532e2',
    },
    {
      id: 'a10479a2-a397-441e-b451-0b649d15cfd6',
      content: 'tRPC is so awesome',
      userId: 'ea120573-2eb4-495e-be48-1b2debac2640',
    },
    {
      id: 'de6867c7-13f1-4932-a69b-e96fd245ee72',
      content: 'Know the ropes',
      userId: '3dcb4a1f-0c91-42c5-834f-26d227c532e2',
    },
    {
      id: '15a742b3-82f6-4fba-9fed-2d1328a4500a',
      content: 'Fight fire with fire',
      userId: 'ea120573-2eb4-495e-be48-1b2debac2640',
    },
    {
      id: '31afa9ad-bc37-4e74-8d8b-1c1656184a33',
      content: 'I ate breakfast today',
      userId: '3dcb4a1f-0c91-42c5-834f-26d227c532e2',
    },
    {
      id: '557cb26a-b26e-4329-a5b4-137327616ead',
      content: 'Par for the course',
      userId: '2ee1c07c-7537-48f5-b5d8-8740e165cd62',
    },
  ],
};
