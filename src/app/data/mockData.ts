export interface Report {
  id: number;
  title: string;
  description: string;
  difficulty: number;
  status: "pending" | "solved" | "in-progress";
  location: { lat: number; lng: number };
  address: string;
  createdBy: string;
  createdAt: string;
  photos: string[];
  comments: Comment[];
  solutions: Solution[];
}

export interface Comment {
  id: number;
  author: string;
  text: string;
  timestamp: string;
  replies: Comment[];
}

export interface Solution {
  id: number;
  reportId: number;
  description: string;
  proofPhotos: string[];
  submittedBy: string;
  submittedAt: string;
  status: "pending" | "accepted" | "rejected";
}

export interface User {
  id: number;
  username: string;
  xp: number;
  streak: number;
  avatar: string;
  rank: number;
}

export interface Reward {
  id: number;
  title: string;
  description: string;
  xpCost: number;
  stock: number;
  imageUrl: string;
}

export const mockReports: Report[] = [
  {
    id: 1,
    title: "Broken Sidewalk on Main Street",
    description: "Large crack creating trip hazard near bus stop",
    difficulty: 3,
    status: "pending",
    location: { lat: 35.1676, lng: 33.3736 },
    address: "Main Street, Nicosia",
    createdBy: "maria_k",
    createdAt: "2026-03-14T10:30:00Z",
    photos: ["https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800"],
    comments: [
      {
        id: 1,
        author: "john_d",
        text: "I've seen this too, very dangerous!",
        timestamp: "2026-03-14T11:00:00Z",
        replies: [
          {
            id: 2,
            author: "maria_k",
            text: "Thanks for confirming!",
            timestamp: "2026-03-14T11:15:00Z",
            replies: [],
          },
        ],
      },
    ],
    solutions: [],
  },
  {
    id: 2,
    title: "Graffiti on Public Building",
    description: "Vandalism on the community center wall",
    difficulty: 2,
    status: "solved",
    location: { lat: 35.1756, lng: 33.3650 },
    address: "Community Center, Nicosia",
    createdBy: "alex_p",
    createdAt: "2026-03-13T14:20:00Z",
    photos: ["https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800"],
    comments: [],
    solutions: [
      {
        id: 1,
        reportId: 2,
        description: "Cleaned and repainted the wall",
        proofPhotos: ["https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=800"],
        submittedBy: "volunteers_cy",
        submittedAt: "2026-03-15T09:00:00Z",
        status: "accepted",
      },
    ],
  },
  {
    id: 3,
    title: "Street Light Not Working",
    description: "Dark area creating safety concern at night",
    difficulty: 4,
    status: "in-progress",
    location: { lat: 35.1656, lng: 33.3800 },
    address: "Park Avenue, Nicosia",
    createdBy: "you",
    createdAt: "2026-03-12T20:45:00Z",
    photos: ["https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800"],
    comments: [
      {
        id: 3,
        author: "admin_cy",
        text: "Electrician scheduled for tomorrow",
        timestamp: "2026-03-13T08:00:00Z",
        replies: [],
      },
    ],
    solutions: [],
  },
  {
    id: 4,
    title: "Illegal Dumping",
    description: "Construction waste dumped in public park",
    difficulty: 5,
    status: "pending",
    location: { lat: 35.1700, lng: 33.3700 },
    address: "Central Park, Nicosia",
    createdBy: "eco_warrior",
    createdAt: "2026-03-11T16:30:00Z",
    photos: ["https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=800"],
    comments: [],
    solutions: [],
  },
  {
    id: 5,
    title: "Pothole on Highway",
    description: "Large pothole causing vehicle damage",
    difficulty: 4,
    status: "pending",
    location: { lat: 35.1620, lng: 33.3750 },
    address: "Highway A1, Nicosia",
    createdBy: "driver_123",
    createdAt: "2026-03-10T07:15:00Z",
    photos: ["https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=800"],
    comments: [],
    solutions: [],
  },
  {
    id: 6,
    title: "Overflowing Trash Bin",
    description: "Public trash bin needs urgent emptying",
    difficulty: 2,
    status: "pending",
    location: { lat: 35.1690, lng: 33.3720 },
    address: "Market Square, Nicosia",
    createdBy: "you",
    createdAt: "2026-03-15T12:00:00Z",
    photos: ["https://images.unsplash.com/photo-1604187351574-c75ca79f5807?w=800"],
    comments: [],
    solutions: [],
  },
  {
    id: 7,
    title: "Damaged Park Bench",
    description: "Broken wooden bench in children's playground",
    difficulty: 3,
    status: "in-progress",
    location: { lat: 35.1650, lng: 33.3690 },
    address: "Children's Park, Nicosia",
    createdBy: "you",
    createdAt: "2026-03-14T09:30:00Z",
    photos: ["https://images.unsplash.com/photo-1519642984756-ebf03acb7729?w=800"],
    comments: [
      {
        id: 4,
        author: "park_admin",
        text: "Thanks for reporting! We'll fix this soon.",
        timestamp: "2026-03-14T10:00:00Z",
        replies: [],
      },
    ],
    solutions: [],
  },
];

export const mockUsers: User[] = [
  { id: 1, username: "civic_hero", xp: 3450, streak: 15, avatar: "https://i.pravatar.cc/150?img=1", rank: 1 },
  { id: 2, username: "green_warrior", xp: 2980, streak: 12, avatar: "https://i.pravatar.cc/150?img=2", rank: 2 },
  { id: 3, username: "city_champion", xp: 2750, streak: 10, avatar: "https://i.pravatar.cc/150?img=3", rank: 3 },
  { id: 4, username: "eco_defender", xp: 2340, streak: 8, avatar: "https://i.pravatar.cc/150?img=4", rank: 4 },
  { id: 5, username: "clean_streets", xp: 2100, streak: 7, avatar: "https://i.pravatar.cc/150?img=5", rank: 5 },
  { id: 6, username: "volunteers_cy", xp: 1890, streak: 9, avatar: "https://i.pravatar.cc/150?img=6", rank: 6 },
  { id: 7, username: "you", xp: 1250, streak: 5, avatar: "https://i.pravatar.cc/150?img=7", rank: 7 },
  { id: 8, username: "maria_k", xp: 1120, streak: 4, avatar: "https://i.pravatar.cc/150?img=8", rank: 8 },
  { id: 9, username: "john_d", xp: 980, streak: 3, avatar: "https://i.pravatar.cc/150?img=9", rank: 9 },
  { id: 10, username: "alex_p", xp: 850, streak: 6, avatar: "https://i.pravatar.cc/150?img=10", rank: 10 },
];

export const mockRewards: Reward[] = [
  {
    id: 1,
    title: "IKEA €100 Voucher",
    description: "Spend on any IKEA products",
    xpCost: 1000,
    stock: 3,
    imageUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400",
  },
  {
    id: 2,
    title: "Cyta Internet Discount",
    description: "20% off for 3 months",
    xpCost: 1000,
    stock: 5,
    imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=400",
  },
  {
    id: 3,
    title: "Coffee Shop €25 Card",
    description: "Redeemable at local cafes",
    xpCost: 500,
    stock: 10,
    imageUrl: "https://images.unsplash.com/photo-1511920170033-f8396924c348?w=400",
  },
  {
    id: 4,
    title: "Cinema Tickets (2x)",
    description: "Two tickets for any movie",
    xpCost: 750,
    stock: 8,
    imageUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400",
  },
];

export const currentUser: User = mockUsers[6]; // "you"