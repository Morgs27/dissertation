import { Flex, Image, Heading } from '@chakra-ui/react';

export const Navbar = () => (
  <Flex h="60px" align="center" px={4} borderBottom="1px solid" borderColor="cerulean" bg="rgba(0,0,0,0.4)">
    <Image src="/logo.svg" h="40px" mr={3} alt="WebSimBench Logo" />
    <Heading size="lg" color="tropicalTeal" letterSpacing="tight">WebSimBench</Heading>
  </Flex>
);

