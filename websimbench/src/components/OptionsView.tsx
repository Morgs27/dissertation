import { Box, FormControl, FormLabel, Input, Grid, GridItem, Heading, Slider, SliderTrack, SliderFilledTrack, SliderThumb, Flex, Select, Text, Button, Switch } from '@chakra-ui/react';
import { SimulationAppearanceOptions, AgentShape, UpdateOptionFn } from '../hooks/useSimulationOptions';
import { LogLevel } from '../simulation/helpers/logger';

interface OptionsViewProps {
  options: SimulationAppearanceOptions;
  updateOption: UpdateOptionFn;
  resetOptions: () => void;
}

export const OptionsView = ({ options, updateOption, resetOptions }: OptionsViewProps) => {
  return (
    <Flex direction="column" h="100%" w="100%" bg="rgba(0,0,0,0.2)" p={6}>
      <Box p={4} borderBottom="1px solid" borderColor="cerulean" mb={4}>
        <Flex justify="space-between" align="center">
          <Heading size="md" color="tropicalTeal">Simulation Options</Heading>
          <Button size="sm" colorScheme="red" variant="outline" onClick={resetOptions}>
            Reset Defaults
          </Button>
        </Flex>
      </Box>

      <Grid templateColumns="repeat(2, 1fr)" gap={8}>
        <GridItem>
          <Heading size="sm" mb={4} color="gray.300">Appearance</Heading>
          <FormControl mb={4}>
            <FormLabel>Agent Color</FormLabel>
            <Flex align="center">
              <Input
                type="color"
                w="60px"
                h="40px"
                p={0}
                mr={2}
                value={options.agentColor}
                onChange={(e) => updateOption('agentColor', e.target.value)}
                bg="transparent"
                border="none"
              />
              <Input
                type="text"
                w="120px"
                value={options.agentColor}
                onChange={(e) => updateOption('agentColor', e.target.value)}
              />
            </Flex>
          </FormControl>

          <FormControl mb={4}>
            <FormLabel>Background Color</FormLabel>
            <Flex align="center">
              <Input
                type="color"
                w="60px"
                h="40px"
                p={0}
                mr={2}
                value={options.backgroundColor}
                onChange={(e) => updateOption('backgroundColor', e.target.value)}
                bg="transparent"
                border="none"
              />
              <Input
                type="text"
                w="120px"
                value={options.backgroundColor}
                onChange={(e) => updateOption('backgroundColor', e.target.value)}
              />
            </Flex>
          </FormControl>

          {options.showTrails && (
            <FormControl mb={4}>
              <FormLabel>Trail Color</FormLabel>
              <Flex align="center">
                <Input
                  type="color"
                  w="60px"
                  h="40px"
                  p={0}
                  mr={2}
                  value={options.trailColor}
                  onChange={(e) => updateOption('trailColor', e.target.value)}
                  bg="transparent"
                  border="none"
                />
                <Input
                  type="text"
                  w="120px"
                  value={options.trailColor}
                  onChange={(e) => updateOption('trailColor', e.target.value)}
                />
              </Flex>
            </FormControl>
          )}
        </GridItem>

        <GridItem>
          <Heading size="sm" mb={4} color="gray.300">Configuration</Heading>
          <FormControl mb={6}>
            <FormLabel>Agent Size (px)</FormLabel>
            <Flex align="center">
              <Slider
                flex="1"
                mr={4}
                min={1}
                max={20}
                step={0.5}
                value={options.agentSize}
                onChange={(val) => updateOption('agentSize', val)}
              >
                <SliderTrack bg="mutedTeal">
                  <SliderFilledTrack bg="cerulean" />
                </SliderTrack>
                <SliderThumb />
              </Slider>
              <Text w="40px">{options.agentSize}</Text>
            </Flex>
          </FormControl>

          <FormControl mb={6}>
            <FormLabel>Agent Shape</FormLabel>
            <Select
              value={options.agentShape}
              onChange={(e) => updateOption('agentShape', e.target.value as AgentShape)}
              bg="jetBlack"
            >
              <option value="circle">Circle</option>
              <option value="square">Square</option>
            </Select>
          </FormControl>

          <FormControl mb={6} display="flex" alignItems="center">
            <FormLabel htmlFor="show-trails" mb="0">
              Show Trails
            </FormLabel>
            <Switch
              id="show-trails"
              isChecked={options.showTrails}
              onChange={(e) => updateOption('showTrails', e.target.checked)}
              colorScheme="teal"
            />
          </FormControl>

          <FormControl mb={6}>
            <FormLabel>Log Verbosity</FormLabel>
            <Select
              value={options.logLevel}
              onChange={(e) => updateOption('logLevel', parseInt(e.target.value) as LogLevel)}
              bg="jetBlack"
            >
              <option value={LogLevel.None}>None</option>
              <option value={LogLevel.Error}>Error</option>
              <option value={LogLevel.Warning}>Warning</option>
              <option value={LogLevel.Info}>Info</option>
              <option value={LogLevel.Verbose}>Verbose</option>
            </Select>
          </FormControl>
        </GridItem>
      </Grid>
    </Flex>
  );
};
