import { Flex, Select, Button, HStack, Icon, Text } from '@chakra-ui/react';
import { FaPlay, FaStop, FaTachometerAlt } from 'react-icons/fa';
import { Method, RenderMode } from '../../simulation/types';

interface ControlsProps {
  method: Method;
  setMethod: (m: Method) => void;
  renderMode: RenderMode;
  setRenderMode: (r: RenderMode) => void;
  isRunning: boolean;
  handleRun: () => void;
  fps: number;
}

export const Controls = ({
  method,
  setMethod,
  renderMode,
  setRenderMode,
  isRunning,
  handleRun,
  fps
}: ControlsProps) => {
  return (
    <Flex p={4} align="center" gap={4} bg="rgba(0,0,0,0.2)" borderBottom="1px solid" borderColor="cerulean">
      <Select
        w="150px"
        value={method}
        onChange={(e) => setMethod(e.target.value as Method)}
        size="sm"
        bg="jetBlack"
      >
        <option value="JavaScript">JavaScript</option>
        <option value="WebAssembly">WebAssembly</option>
        <option value="WebGPU">WebGPU</option>
        <option value="WebWorkers">WebWorkers</option>
      </Select>

      <Select
        w="120px"
        value={renderMode}
        onChange={(e) => setRenderMode(e.target.value as RenderMode)}
        size="sm"
        bg="jetBlack"
      >
        <option value="cpu">CPU Render</option>
        <option value="gpu">GPU Render</option>
      </Select>

      <Button
        leftIcon={isRunning ? <FaStop /> : <FaPlay />}
        colorScheme={isRunning ? "red" : "green"}
        onClick={handleRun}
        size="sm"
      >
        {isRunning ? "Stop" : "Run"}
      </Button>

      <HStack ml="auto" spacing={4}>
        <Flex align="center">
          <Icon as={FaTachometerAlt} mr={2} />
          <Text>{fps} FPS</Text>
        </Flex>
      </HStack>
    </Flex>
  );
};

