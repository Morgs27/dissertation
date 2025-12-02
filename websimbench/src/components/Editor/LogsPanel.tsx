import { Flex, Icon, Text, Button, VStack, Box, Select } from '@chakra-ui/react';
import { FaBug } from 'react-icons/fa';
import { LogMessage } from '../../hooks/useLogger';
import { useState } from 'react';
import { LogLevel } from '../../simulation/helpers/logger';

interface LogsPanelProps {
  logs: LogMessage[];
  onClear: () => void;
}

export const LogsPanel = ({ logs, onClear }: LogsPanelProps) => {
  const [filterLevel, setFilterLevel] = useState<string>('All');

  const filteredLogs = logs.filter(log => {
    if (filterLevel === 'All') return true;

    // Map string representation back to LogLevel enum for comparison
    const logValues: Record<string, number> = {
      'Error': LogLevel.Error,
      'Warning': LogLevel.Warning,
      'Info': LogLevel.Info,
      'Verbose': LogLevel.Verbose,
      'None': LogLevel.None
    };

    const filterValue = logValues[filterLevel] || LogLevel.Verbose;
    const currentLogValue = logValues[log.level] || LogLevel.Info;

    // Show logs that are less than or equal to the selected verbosity
    // But wait, user usually wants "Show errors only" or "Show everything".
    // If filter is "Error", show Error.
    // If filter is "Warning", show Error and Warning? Or just Warning?
    // Usually a filter dropdown is inclusive of severity.
    // But here, let's just do exact match if not 'All', or maybe inclusive severity.

    // Let's implement inclusive filtering:
    // If filter is Verbose (4), show everything (Error, Warning, Info, Verbose).
    // If filter is Info (3), show Error, Warning, Info.
    // If filter is Warning (2), show Error, Warning.
    // If filter is Error (1), show Error.

    // Wait, typical "Filter" behavior might just be "Show me this level and more severe".
    // So if I select "Info", I want to see Info, Warnings and Errors.
    // LogLevel: Error=1, Warning=2, Info=3, Verbose=4.
    // So if currentLogValue <= filterValue, we show it.

    return currentLogValue <= filterValue;
  });

  return (
    <Flex direction="column" h="100%" borderTop="1px solid" borderColor="cerulean" bg="rgba(0,0,0,0.3)">
      <Flex px={4} py={2} align="center" bg="rgba(0,0,0,0.2)">
        <Icon as={FaBug} mr={2} />
        <Text fontWeight="bold" mr={4}>Logs & Errors</Text>

        <Select
          size="xs"
          width="120px"
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          bg="rgba(0,0,0,0.3)"
          borderColor="gray.600"
          mr={2}
        >
          <option value="All">All Levels</option>
          <option value="Verbose">Verbose</option>
          <option value="Info">Info</option>
          <option value="Warning">Warning</option>
          <option value="Error">Error</option>
        </Select>

        <Button size="xs" ml="auto" onClick={onClear} colorScheme="red" variant="ghost">Clear</Button>
      </Flex>
      <VStack flex="1" overflowY="auto" align="start" spacing={0} p={2} fontFamily="monospace" fontSize="sm">
        {filteredLogs.map((log, i) => (
          <Box key={i} w="100%" color={log.level === 'Error' ? 'red.300' : log.level === 'Warning' ? 'orange.300' : 'gray.300'}>
            <Text as="span" color="gray.500">[{new Date(log.timestamp).toLocaleTimeString()}]</Text>
            <Text as="span" fontWeight="bold" mx={2}>[{log.context}]</Text>
            {log.message}
          </Box>
        ))}
      </VStack>
    </Flex>
  );
};
