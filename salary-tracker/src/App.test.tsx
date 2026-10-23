import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const signIn = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/Email address/i), 'tester@example.com');
    await user.type(screen.getByLabelText(/^Password/i), 'demo-password');
    await user.click(screen.getByRole('button', { name: /Sign in to SmartSpend/i }));
};

describe('App', () => {
    it('toggles password visibility on the sign-in page', async () => {
        const user = userEvent.setup();
        render(<App />);

        const passwordInput = screen.getByLabelText(/^Password/i);
        expect(passwordInput.getAttribute('type')).toBe('password');

        await user.click(screen.getByRole('button', { name: 'Show password' }));
        expect(passwordInput.getAttribute('type')).toBe('text');

        await user.click(screen.getByRole('button', { name: 'Hide password' }));
        expect(passwordInput.getAttribute('type')).toBe('password');
    });

    it('shows the sign-in page before the dashboard and supports signing out', async () => {
        const user = userEvent.setup();
        render(<App />);

        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
        await signIn(user);
        expect(screen.getByRole('button', { name: /Add expense/i })).toBeTruthy();

        await user.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
        expect((screen.getByLabelText(/Email address/i) as HTMLInputElement).value).toBe('tester@example.com');

        await user.type(screen.getByLabelText(/^Password/i), 'demo-password');
        await user.click(screen.getByRole('button', { name: /Sign in to SmartSpend/i }));
        await user.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    });

    it('offers Google demo sign-in without a GitHub sign-in option', async () => {
        const user = userEvent.setup();
        render(<App />);

        await user.click(screen.getByRole('button', { name: 'Continue with Google (demo)' }));

        expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /GitHub/i })).toBeNull();
    });

    it('lets the user edit and save personal profile details', async () => {
        const user = userEvent.setup();
        render(<App />);
        await signIn(user);

        await user.click(screen.getByRole('button', { name: 'Edit profile' }));
        fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Taylor Morgan' } });
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'taylor@example.com' } });
        fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+1 555 0100' } });
        fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Accountant' } });
        fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Seattle' } });
        fireEvent.change(screen.getByLabelText('Age'), { target: { value: '34' } });
        await user.click(screen.getByRole('button', { name: 'Save profile' }));

        expect(screen.getByRole('heading', { name: 'Taylor Morgan' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Welcome, Taylor Morgan' })).toBeTruthy();
        expect(screen.getByText('taylor@example.com')).toBeTruthy();
        expect(JSON.parse(window.localStorage.getItem('smartspend:v1') || '{}').profile).toEqual({
            name: 'Taylor Morgan',
            email: 'taylor@example.com',
            phone: '+1 555 0100',
            role: 'Accountant',
            location: 'Seattle',
            age: '34'
        });
    });

    it('shows a finance quote different from the one shown on the previous page load', async () => {
        const user = userEvent.setup();
        window.localStorage.setItem('smartspend:last-quote-index', '0');
        render(<App />);
        await signIn(user);

        expect(screen.queryByText(/A budget is a plan for your money/)).toBeNull();
        expect(screen.getByText(/Small, steady savings|Spend with intention|Progress in personal finance|The best time to plan/)).toBeTruthy();
    });

    it('renders the SmartSpend dashboard branding', async () => {
        const user = userEvent.setup();
        render(<App />);

        await signIn(user);
        expect(screen.getByRole('heading', { name: /SmartSpend Pro/i })).toBeTruthy();
        expect(screen.getByText(/Intelligent Personal Expense Tracker/i)).toBeTruthy();
    });

    it('adds a transaction from the modal form', async () => {
        const user = userEvent.setup();
        render(<App />);
        await signIn(user);

        await user.click(screen.getByRole('button', { name: /Add expense/i }));

        expect(screen.getByRole('dialog')).toBeTruthy();

        await user.clear(screen.getByLabelText(/Amount \(₹\)/i));
        await user.type(screen.getByLabelText(/Amount \(₹\)/i), '2500');
        await user.clear(screen.getByLabelText(/Description \/ Notes/i));
        await user.type(screen.getByLabelText(/Description \/ Notes/i), 'Lunch');
        await user.click(screen.getByRole('button', { name: /Record Transaction/i }));

        expect(await screen.findByText(/Lunch/i)).toBeTruthy();
    });

    it('records income with an income category', async () => {
        const user = userEvent.setup();
        render(<App />);
        await signIn(user);

        await user.click(screen.getByRole('button', { name: /Add income/i }));
        await user.type(screen.getByLabelText(/Amount \(₹\)/i), '32000');
        await user.selectOptions(screen.getByLabelText(/Category/i), 'Salary');
        await user.type(screen.getByLabelText(/Description \/ Notes/i), 'Test paycheck');
        await user.click(screen.getByRole('button', { name: /Record Transaction/i }));

        expect(await screen.findByText('Test paycheck')).toBeTruthy();
        expect(screen.getByText('+₹32,000')).toBeTruthy();
    });

    it('categorizes a new expense', async () => {
        const user = userEvent.setup();
        render(<App />);
        await signIn(user);

        await user.click(screen.getByRole('button', { name: /Add expense/i }));
        await user.type(screen.getByLabelText(/Amount \(₹\)/i), '900');
        await user.selectOptions(screen.getByLabelText(/Category/i), 'Travel');
        await user.type(screen.getByLabelText(/Description \/ Notes/i), 'Train ticket');
        await user.click(screen.getByRole('button', { name: /Record Transaction/i }));

        expect(await screen.findByText('Train ticket')).toBeTruthy();
        expect(screen.getAllByText('Travel').length).toBeGreaterThan(0);
    });

    it('updates the monthly budget and remaining balance', async () => {
        const user = userEvent.setup();
        render(<App />);
        await signIn(user);

        await user.click(screen.getByRole('button', { name: 'Adjust' }));
        const budgetDialog = screen.getByRole('dialog');
        const budgetInput = within(budgetDialog).getAllByRole('spinbutton')[0];
        await user.clear(budgetInput);
        await user.type(budgetInput, '50000');
        await user.click(screen.getByRole('button', { name: /Apply Budgets/i }));

        expect(screen.getByText('₹50,000')).toBeTruthy();
        expect(screen.getByText('Left ₹15,401')).toBeTruthy();
    });

    it('shows spending summaries in the analytics charts', async () => {
        const user = userEvent.setup();
        render(<App />);
        await signIn(user);

        await user.click(screen.getByRole('button', { name: 'Analytics' }));

        expect(screen.getByText(/Monthly Comparison \(Income vs Expense\)/i)).toBeTruthy();
        expect(screen.getByText('Category-wise Expenditure')).toBeTruthy();
        expect(screen.getByText('Daily Spending Trend')).toBeTruthy();
    });
});
