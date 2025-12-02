import { Box, Heading, Grid, GridItem, Flex, Text, Slider, SliderTrack, SliderFilledTrack, SliderThumb } from '@chakra-ui/react';
import { InputDefinition } from '../../simulation/types';

interface InputsProps {
  inputs: Record<string, number>;
  definedInputs: InputDefinition[];
  handleInputChange: (key: string, value: number) => void;
}

export const Inputs = ({ inputs, definedInputs, handleInputChange }: InputsProps) => {
  return (
    <Box
      position="absolute"
      bottom={0}
      left={0}
      right={0}
      bg="rgba(31, 54, 61, 0.9)"
      p={4}
      maxH="30%"
      overflowY="auto"
      borderTop="1px solid"
      borderColor="cerulean"
      zIndex={10}
    >
      <Heading size="xs" mb={4}>Simulation Inputs</Heading>
      <Grid templateColumns="repeat(2, 1fr)" gap={6}>
        {/* Show default agent count slider only if not defined in DSL */}
        {!definedInputs.some(d => d.name === 'agentCount') && (
          <GridItem>
            <Flex direction="column">
              <Flex justify="space-between" mb={1}>
                <Text fontSize="xs">agentCount</Text>
                <Text fontSize="xs">{inputs.agentCount || 1000}</Text>
              </Flex>
              <Slider
                aria-label="agentCount"
                value={inputs.agentCount || 1000}
                min={10}
                max={100000}
                step={10}
                onChange={(val) => handleInputChange('agentCount', val)}
              >
                <SliderTrack bg="mutedTeal">
                  <SliderFilledTrack bg="cerulean" />
                </SliderTrack>
                <SliderThumb />
              </Slider>
            </Flex>
          </GridItem>
        )}

        {/* Dynamic sliders from defined inputs */}
        {definedInputs.map((def) => (
          <GridItem key={def.name}>
            <Flex direction="column">
              <Flex justify="space-between" mb={1}>
                <Text fontSize="xs">{def.name}</Text>
                <Text fontSize="xs">{inputs[def.name] ?? def.defaultValue}</Text>
              </Flex>
              <Slider
                aria-label={def.name}
                value={inputs[def.name] ?? def.defaultValue}
                min={def.min ?? 0}
                max={def.max ?? 100}
                step={(def.max && def.max <= 1) ? 0.001 : 1}
                onChange={(val) => handleInputChange(def.name, val)}
              >
                <SliderTrack bg="mutedTeal">
                  <SliderFilledTrack bg="cerulean" />
                </SliderTrack>
                <SliderThumb />
              </Slider>
            </Flex>
          </GridItem>
        ))}
      </Grid>
    </Box>
  );
};

