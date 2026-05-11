"""Minimal CrewAI agent using GhostCrab tools through MCP stdio."""

# Requires:
# npm install -g @mindflight/ghostcrab-personal-mcp
# pip install crewai "crewai-tools>=0.42.0" mcp

from crewai import Agent, Crew, Process, Task
from crewai_tools import MCPServerAdapter

from ghostcrab_crewai import ghostcrab_stdio_server_params


with MCPServerAdapter(ghostcrab_stdio_server_params()) as ghostcrab_tools:
    researcher = Agent(
        role="Researcher",
        goal="Use GhostCrab tools to preserve useful operational memory.",
        backstory="A careful agent that keeps durable findings retrievable.",
        tools=ghostcrab_tools,
        verbose=True,
    )

    task = Task(
        description=(
            "Check GhostCrab status, then store one concise project finding "
            "with the appropriate ghostcrab_* tool."
        ),
        expected_output="A short confirmation of the saved finding.",
        agent=researcher,
    )

    crew = Crew(
        agents=[researcher],
        tasks=[task],
        process=Process.sequential,
        verbose=True,
    )

    crew.kickoff()
