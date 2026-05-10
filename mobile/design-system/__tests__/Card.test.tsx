import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card } from '../Card';

describe('Card', () => {
  test('renders children with default styling', () => {
    const { toJSON } = render(<Card><Text>Hello</Text></Card>);
    expect(toJSON()).toMatchSnapshot();
  });

  test('accepts className override', () => {
    const { toJSON } = render(
      <Card className="bg-blue-50"><Text>Custom</Text></Card>
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
