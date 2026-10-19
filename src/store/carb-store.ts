import { create } from 'zustand';
import type { Company, User, UserPortfolio } from '@/types/carb';

interface UserState {
  user: User | null;
  portfolio: UserPortfolio | null;
  isLoading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  setPortfolio: (portfolio: UserPortfolio | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  portfolio: null,
  isLoading: false,
  error: null,
  setUser: (user) => set({ user }),
  setPortfolio: (portfolio) => set({ portfolio }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));

interface CompanyState {
  companies: Company[];
  selectedCompany: Company | null;
  isLoading: boolean;
  error: string | null;
  setCompanies: (companies: Company[]) => void;
  setSelectedCompany: (company: Company | null) => void;
  addCompany: (company: Company) => void;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useCompanyStore = create<CompanyState>((set) => ({
  companies: [],
  selectedCompany: null,
  isLoading: false,
  error: null,
  setCompanies: (companies) => set({ companies }),
  setSelectedCompany: (company) => set({ selectedCompany: company }),
  addCompany: (company) =>
    set((state) => ({ companies: [...state.companies, company] })),
  updateCompany: (id, updates) =>
    set((state) => ({
      companies: state.companies.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));

interface MarketplaceState {
  selectedFilter: 'all' | 'buying' | 'selling' | 'retiring';
  sortBy: 'price' | 'date' | 'volume';
  sortOrder: 'asc' | 'desc';
  setSelectedFilter: (
    filter: 'all' | 'buying' | 'selling' | 'retiring'
  ) => void;
  setSortBy: (sortBy: 'price' | 'date' | 'volume') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
}

export const useMarketplaceStore = create<MarketplaceState>((set) => ({
  selectedFilter: 'all',
  sortBy: 'price',
  sortOrder: 'asc',
  setSelectedFilter: (filter) => set({ selectedFilter: filter }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
}));

interface UIState {
  isSidebarOpen: boolean;
  selectedTab: string;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setSelectedTab: (tab: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  selectedTab: 'overview',
  toggleSidebar: () =>
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  setSelectedTab: (tab) => set({ selectedTab: tab }),
}));
